import TrackPlayer, {Event, State, Track, useTrackPlayerEvents} from 'react-native-track-player'
import {usePlayedStore} from '@/store/played'
import {endTrackSwitch} from '@/store/trackSwitch'

const events: Event[] = [
  Event.PlaybackState,
  Event.PlaybackError,
  Event.PlaybackActiveTrackChanged,
  Event.PlaybackQueueEnded,
]

/** how close to the end still counts as "listened to the end" */
const FINISHED_SLACK_SECONDS = 15

/**
 * States that mean the player has stopped WORKING on the switch — it either
 * started the track or gave up on it. `Ready` is deliberately not one of them:
 * the track is loaded but silent, and on a manual skip the `play()` that
 * follows is still on its way.
 */
const SETTLED: State[] = [State.Playing, State.Paused, State.Stopped, State.Ended, State.Error]

export const useLogTrackPlayerState = () => {
  const markPlayed = usePlayedStore((state) => state.markPlayed)

  useTrackPlayerEvents(events, async (event) => {
    if (event.type === Event.PlaybackError) {
      console.warn('An error occurred: ', event)
      // Whatever the recovery does about it, the spinner is not the way to say
      // it failed.
      endTrackSwitch()
    }

    if (event.type === Event.PlaybackState) {
      console.log('Playback state: ', event.state)
      if (SETTLED.includes(event.state)) endTrackSwitch()
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

    // The LAST track of the queue runs out without a track change behind it, so
    // it would never be ticked off by the branch above — the one case where
    // "played to the end" is most certainly true.
    if (event.type === Event.PlaybackQueueEnded) {
      endTrackSwitch()
      try {
        const activeTrack = await TrackPlayer.getActiveTrack()
        if (activeTrack) markPlayed(activeTrack)
      } catch (error) {
        console.warn('Unable to read the track the queue ended on', error)
      }
    }
  })
}
