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

export const reducer = (data: any[]) => {
  return [...data.reduce(
    (acc, curr) => acc.set(curr.id, {...acc.get(curr.id), ...curr}),
    new Map()
  )
    .values()];
}


