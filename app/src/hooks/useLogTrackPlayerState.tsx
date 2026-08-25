import {Event, Track, useTrackPlayerEvents} from 'react-native-track-player'
import {usePlayedStore} from '@/store/played'

const events: Event[] = [Event.PlaybackState, Event.PlaybackError, Event.PlaybackActiveTrackChanged]

/** how close to the end still counts as "listened to the end" */
const FINISHED_SLACK_SECONDS = 15

export const useLogTrackPlayerState = () => {
  const markPlayed = usePlayedStore((state) => state.markPlayed)

  useTrackPlayerEvents(events, async (event) => {
    if (event.type === Event.PlaybackError) {
      console.warn('An error occurred: ', event)
    }

    if (event.type === Event.PlaybackState) {
      console.log('Playback state: ', event.state)
    }

    if (event.type === Event.PlaybackActiveTrackChanged) {
      console.log('Track changed', event.index)

      // The track that just left is marked played only if it actually ran out —
      // skipping through the list must not tick off everything on the way.
      const lastTrack = event.lastTrack as (Track & {duration?: number}) | undefined
      const lastPosition = event.lastPosition ?? 0
      const duration = lastTrack?.duration ?? 0
      if (lastTrack && duration > 0 && lastPosition >= duration - FINISHED_SLACK_SECONDS) {
        markPlayed(lastTrack)
      }
    }
  })
}
