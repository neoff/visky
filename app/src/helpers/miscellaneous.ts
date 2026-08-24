export const formatSecondsToMinutes = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)

  const formattedMinutes = String(minutes).padStart(2, '0')
  const formattedSeconds = String(remainingSeconds).padStart(2, '0')

  return `${formattedMinutes}:${formattedSeconds}`
}

export const generateTracksListId = (trackListName: string, count:number, search?: string) => {
  return `${trackListName}${count}${`-${search}` || ''}`
}

/**
 * De-duplicate tracks by id. THE FIRST OCCURRENCE WINS.
 *
 * Every caller passes `[...freshFromApi, ...cachedTracks]`, so "first wins"
 * means the server is authoritative: a track that is already in the MMKV cache
 * keeps the cached fields only for keys the server did not send. Before, the
 * spread was `{...acc.get(id), ...curr}`, i.e. the LAST occurrence won — the
 * stale cache overwrote freshly cleaned titles, so renamed tracks (e.g. the
 * "FRISKY | " prefix removed on the API) never changed on screen.
 *
 * The Map also fixes the order to the first insertion, which is the order the
 * API returned (Part 1 before Part 2).
 */
export const reducer = (data: any[]) => {
  return [...data.reduce(
    (acc, curr) => acc.set(curr.id, {...curr, ...acc.get(curr.id)}),
    new Map()
  )
    .values()];
}


