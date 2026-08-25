import {useCallback, useEffect, useRef, useState} from 'react'
import {Track} from 'react-native-track-player'

export const PAGE_SIZE = 50
/** how many pages stay in the list; older ones are dropped as new ones arrive */
const MAX_PAGES = 4

export type TrackPageLoader = (offset: number, count: number) => Promise<Track[]>

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
 */
export const useWindowedTracks = (loader: TrackPageLoader, enabled: boolean = true) => {
  const [tracks, setTracks] = useState<Track[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // the page range currently in `tracks`, as [first, last] inclusive
  const range = useRef({first: 0, last: -1})
  const busy = useRef(false)
  const exhausted = useRef(false)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const reset = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setRefreshing(true)
    try {
      const page = await loaderRef.current(0, PAGE_SIZE)
      range.current = {first: 0, last: 0}
      // ONLY an empty page means the end. A short one does not: VK drops
      // restricted tracks from a page, so asking for 50 can answer with 49 and
      // there is still an archive behind it.
      exhausted.current = page.length === 0
      setTracks(page)
    } catch (error) {
      console.warn('Unable to load the first page', error)
    } finally {
      busy.current = false
      setRefreshing(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (busy.current || exhausted.current || range.current.last < 0) return
    busy.current = true
    setLoadingMore(true)
    try {
      const next = range.current.last + 1
      const page = await loaderRef.current(next * PAGE_SIZE, PAGE_SIZE)
      if (page.length === 0) {
        exhausted.current = true
        return
      }

      setTracks((current) => {
        const grown = [...current, ...page]
        const pages = next - range.current.first + 1
        if (pages <= MAX_PAGES) {
          range.current = {first: range.current.first, last: next}
          return grown
        }
        // over the cap: the oldest page leaves at the front
        range.current = {first: range.current.first + 1, last: next}
        return grown.slice(page.length)
      })
    } catch (error) {
      console.warn('Unable to load the next page', error)
    } finally {
      busy.current = false
      setLoadingMore(false)
    }
  }, [])

  const loadPrevious = useCallback(async () => {
    if (busy.current || range.current.first === 0) return
    busy.current = true
    setLoadingMore(true)
    try {
      const previous = range.current.first - 1
      const page = await loaderRef.current(previous * PAGE_SIZE, PAGE_SIZE)
      if (page.length === 0) return

      setTracks((current) => {
        const grown = [...page, ...current]
        const pages = range.current.last - previous + 1
        if (pages <= MAX_PAGES) {
          range.current = {first: previous, last: range.current.last}
          return grown
        }
        // over the cap: the newest page leaves at the end, and it can be
        // fetched again by scrolling back down
        range.current = {first: previous, last: range.current.last - 1}
        exhausted.current = false
        return grown.slice(0, grown.length - page.length)
      })
    } catch (error) {
      console.warn('Unable to load the previous page', error)
    } finally {
      busy.current = false
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    reset()
  }, [enabled, reset])

  return {tracks, refreshing, loadingMore, reset, loadMore, loadPrevious, setTracks}
}
