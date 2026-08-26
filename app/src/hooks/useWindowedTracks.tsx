import {useCallback, useEffect, useRef, useState} from 'react'
import {Track} from 'react-native-track-player'
import {storage} from '@/store/library'
import {trackKey} from '@/helpers/miscellaneous'
import {usePlaybackStore} from '@/store/playback'

export const PAGE_SIZE = 50
/** how many pages stay in the list; older ones are dropped as new ones arrive */
const MAX_PAGES = 4

export type TrackPageLoader = (offset: number, count: number) => Promise<Track[]>

/** one loaded page, kept as its own bucket so trimming drops a WHOLE page */
type LoadedPage = {index: number; items: Track[]}

const readCache = (key: string | undefined): Track[] => {
  if (!key) return []
  try {
    return (storage.getArray<Track>(key) ?? []) as Track[]
  } catch (error) {
    console.warn('Unable to read the cached page', error)
    return []
  }
}

const writeCache = (key: string | undefined, items: Track[]) => {
  if (!key) return
  try {
    storage.setArray(key, items)
  } catch (error) {
    console.warn('Unable to cache the first page', error)
  }
}

/**
 * A sliding window over a list that is thousands of tracks long.
 *
 * The Songs tab used to fetch exactly one page of 100 and stop there — the
 * archive goes back years, so most of it was simply unreachable. Loading it all
 * instead would grow the scroll forever and take the UI down with it.
 *
 * So the list holds at most `MAX_PAGES` pages: reaching the end appends the next
 * page and drops the first, reaching the top prepends the previous one and drops
 * the last. FlashList's `maintainVisibleContentPosition` (on by default in v2)
 * keeps the visible rows still while that happens, so the scroll neither jumps
 * nor grows without bound.
 *
 * The window lives in a ref of whole pages, NOT in the `setTracks` updater.
 * React runs a functional updater during the render pass, not at the call site,
 * so bookkeeping written inside one lands AFTER the next `onEndReached` has
 * already read it: two scroll events in the same frame both saw the old page
 * number, fetched the SAME offset twice and appended it twice, while the page
 * counter advanced only once. That is why the list grew without ever trimming
 * and the scroll stuck at the bottom re-loading forever. Mutating the ref
 * synchronously — and rebuilding `tracks` from it — keeps the two in step.
 *
 * @param cacheKey  MMKV key the first page is mirrored to. With one, a cold
 *                  start renders the last known page immediately instead of an
 *                  empty screen, and the network answer replaces it when it
 *                  arrives.
 */
export const useWindowedTracks = (
  loader: TrackPageLoader,
  enabled: boolean = true,
  cacheKey?: string,
) => {
  const cacheKeyRef = useRef(cacheKey)
  cacheKeyRef.current = cacheKey

  // the window, oldest page first; `tracks` is always its flattened form
  const pages = useRef<LoadedPage[]>([])
  if (pages.current.length === 0 && cacheKey) {
    const cached = readCache(cacheKey)
    if (cached.length) {
      pages.current = [{index: 0, items: cached}]
      console.debug(`==window ${cacheKey}: seeded ${cached.length} tracks from cache`)
    }
  }

  const [tracks, setTracks] = useState<Track[]>(() => pages.current[0]?.items ?? [])
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const busy = useRef(false)
  const exhausted = useRef(false)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  /** flatten the window into the list, dropping any track that appears twice */
  const publish = useCallback(() => {
    const seen = new Set<string>()
    const flat: Track[] = []
    for (const page of pages.current) {
      for (const item of page.items) {
        const key = trackKey(item as any) ?? ''
        if (key && seen.has(key)) continue
        if (key) seen.add(key)
        flat.push(item)
      }
    }
    console.debug(
      `==window ${cacheKeyRef.current ?? 'list'}: pages ${pages.current.map((page) => page.index).join(',')}`
      + ` -> ${flat.length} tracks`,
    )
    setTracks(flat)
  }, [])

  const reset = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setRefreshing(true)
    try {
      const items = await loaderRef.current(0, PAGE_SIZE)
      pages.current = [{index: 0, items}]
      // ONLY an empty page means the end. A short one does not: VK drops
      // restricted tracks from a page, so asking for 50 can answer with 49 and
      // there is still an archive behind it.
      exhausted.current = items.length === 0
      publish()
      if (items.length) writeCache(cacheKeyRef.current, items)
    } catch (error) {
      console.warn('Unable to load the first page', error)
    } finally {
      busy.current = false
      setRefreshing(false)
    }
  }, [publish])

  const loadMore = useCallback(async () => {
    if (busy.current || exhausted.current || pages.current.length === 0) return
    busy.current = true
    setLoadingMore(true)
    try {
      const next = pages.current[pages.current.length - 1].index + 1
      const items = await loaderRef.current(next * PAGE_SIZE, PAGE_SIZE)
      if (items.length === 0) {
        exhausted.current = true
        return
      }

      const grown = [...pages.current, {index: next, items}]
      // over the cap: the oldest pages leave at the front
      pages.current = grown.length > MAX_PAGES ? grown.slice(grown.length - MAX_PAGES) : grown
      publish()
    } catch (error) {
      console.warn('Unable to load the next page', error)
    } finally {
      busy.current = false
      setLoadingMore(false)
    }
  }, [publish])

  const loadPrevious = useCallback(async () => {
    const first = pages.current[0]?.index ?? 0
    if (busy.current || first === 0) return
    busy.current = true
    setLoadingMore(true)
    try {
      const previous = first - 1
      const items = await loaderRef.current(previous * PAGE_SIZE, PAGE_SIZE)
      if (items.length === 0) return

      const grown = [{index: previous, items}, ...pages.current]
      if (grown.length > MAX_PAGES) {
        // the newest page leaves at the end; scrolling back down fetches it again
        pages.current = grown.slice(0, MAX_PAGES)
        exhausted.current = false
      } else {
        pages.current = grown
      }
      publish()
    } catch (error) {
      console.warn('Unable to load the previous page', error)
    } finally {
      busy.current = false
      setLoadingMore(false)
    }
  }, [publish])

  /**
   * Re-read the pages that are ON SCREEN, keeping the window where it is.
   *
   * This is what a metadata update triggers, and it must not behave like a
   * pull-to-refresh: `reset()` throws the window back to page 0, which would
   * yank a user who is scrolled deep into the archive up to the top for a
   * tracklist they did not ask for. A page that comes back empty keeps the one
   * already held, so a hiccup never blanks the list.
   */
  const refreshWindow = useCallback(async () => {
    const snapshot = pages.current
    if (busy.current || snapshot.length === 0) return
    busy.current = true
    try {
      const reloaded = await Promise.all(
        snapshot.map((page) => loaderRef.current(page.index * PAGE_SIZE, PAGE_SIZE)),
      )
      pages.current = snapshot.map((page, at) => ({
        index: page.index,
        items: reloaded[at].length ? reloaded[at] : page.items,
      }))
      publish()
      const first = pages.current.find((page) => page.index === 0)
      if (first) writeCache(cacheKeyRef.current, first.items)
    } catch (error) {
      console.warn('Unable to refresh the window', error)
    } finally {
      busy.current = false
    }
  }, [publish])

  useEffect(() => {
    if (!enabled) return
    reset()
  }, [enabled, reset])

  // The API resolved frisky.fm metadata for tracks it had none for and said so
  // over the playback socket. Re-read what is on screen so the tracklist and
  // the genres appear on their own.
  const catalogRevision = usePlaybackStore((state) => state.catalogRevision)
  useEffect(() => {
    if (!enabled || catalogRevision === 0) return
    void refreshWindow()
  }, [catalogRevision, enabled, refreshWindow])

  return {tracks, refreshing, loadingMore, reset, refreshWindow, loadMore, loadPrevious, setTracks}
}
