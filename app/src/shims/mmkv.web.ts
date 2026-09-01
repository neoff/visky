import {useCallback, useEffect, useState} from 'react'

/**
 * `react-native-mmkv-storage` for the web build.
 *
 * MMKV is a synchronous key/value store, and every call site here relies on
 * that: `store/playback` reads the last session during module evaluation so a
 * cold start can paint the mini player before the socket says anything.
 * `localStorage` is the only web store with the same synchronous contract, so
 * that is what this is built on.
 *
 * Only the surface the app actually uses is implemented — `getString`,
 * `setString`, `getArray`, `setArray`, `getArrayAsync` and `useMMKVStorage`.
 * Anything else would be untested code pretending to work.
 *
 * KNOWN LIMIT: `localStorage` is capped around 5 MB per origin, and the Songs
 * tab caches whole pages of tracks. A write that does not fit throws
 * QuotaExceededError; that is caught and logged rather than left to kill a
 * render, so the app degrades to "no cache" instead of to a white screen.
 */

type Listener = (value: unknown) => void

class WebMMKVInstance {
  private readonly prefix: string
  private readonly listeners = new Map<string, Set<Listener>>()

  constructor(instanceId: string) {
    // Instance ids are namespaces in MMKV; keep them apart here too, or the
    // 'playlist', 'playback' and 'played' stores would share one flat space.
    this.prefix = `mmkv.${instanceId}.`
  }

  /** Raw read. Returns null for "absent" AND for "unparseable", by design. */
  getItem<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(this.prefix + key)
      return raw == null ? null : (JSON.parse(raw) as T)
    } catch {
      return null
    }
  }

  setItem(key: string, value: unknown): void {
    try {
      window.localStorage.setItem(this.prefix + key, JSON.stringify(value))
    } catch (error) {
      // Out of quota, or private mode. Losing the cache is survivable; the
      // lists refill from the API on the next refresh.
      console.warn('==mmkv(web): could not persist', key, error)
    }
    this.listeners.get(key)?.forEach((listener) => listener(value))
  }

  subscribe(key: string, listener: Listener): () => void {
    const forKey = this.listeners.get(key) ?? new Set<Listener>()
    forKey.add(listener)
    this.listeners.set(key, forKey)
    return () => {
      forKey.delete(listener)
    }
  }

  getString(key: string): string | null {
    const value = this.getItem<unknown>(key)
    return typeof value === 'string' ? value : null
  }

  setString(key: string, value: string): void {
    this.setItem(key, value)
  }

  getArray<T>(key: string): T[] | null {
    const value = this.getItem<unknown>(key)
    return Array.isArray(value) ? (value as T[]) : null
  }

  setArray<T>(key: string, value: T[]): void {
    this.setItem(key, value)
  }

  /** MMKV offers an async twin of every getter; on the web it is already done. */
  async getArrayAsync<T>(key: string): Promise<T[] | null> {
    return this.getArray<T>(key)
  }

  getMap<T>(key: string): T | null {
    const value = this.getItem<unknown>(key)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : null
  }

  setMap<T>(key: string, value: T): void {
    this.setItem(key, value)
  }

  removeItem(key: string): void {
    window.localStorage.removeItem(this.prefix + key)
    this.listeners.get(key)?.forEach((listener) => listener(null))
  }

  clearStore(): void {
    const doomed = Object.keys(window.localStorage).filter((key) => key.startsWith(this.prefix))
    for (const key of doomed) window.localStorage.removeItem(key)
  }
}

export type MMKVInstance = WebMMKVInstance

/** The builder shape MMKV uses: `new MMKVLoader().withInstanceID(id).initialize()`. */
export class MMKVLoader {
  private instanceId = 'default'

  withInstanceID(id: string): this {
    this.instanceId = id
    return this
  }

  /** Accepted and ignored: there is no encryption story for localStorage. */
  withEncryption(): this {
    return this
  }

  setAccessibleIOS(): this {
    return this
  }

  initialize(): WebMMKVInstance {
    return new WebMMKVInstance(this.instanceId)
  }
}

/**
 * Reactive read/write on one key, the same contract as MMKV's own hook: the
 * value re-renders when ANY holder of the same instance writes that key, which
 * is what keeps two tabs of the app showing one list.
 */
export const useMMKVStorage = <T,>(
  key: string,
  storage: WebMMKVInstance,
  defaultValue: T,
): [T, (next: T) => void] => {
  const [value, setValue] = useState<T>(() => storage.getItem<T>(key) ?? defaultValue)

  useEffect(() => {
    setValue(storage.getItem<T>(key) ?? defaultValue)
    return storage.subscribe(key, (next) => setValue((next as T) ?? defaultValue))
    // `defaultValue` is a fresh literal at most call sites ([]), so it is
    // deliberately not a dependency: it would resubscribe on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, storage])

  const update = useCallback(
    (next: T) => {
      storage.setItem(key, next)
      setValue(next)
    },
    [key, storage],
  )

  return [value, update]
}

export default {MMKVLoader, useMMKVStorage}
