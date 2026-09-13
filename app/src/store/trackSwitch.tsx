import {create} from 'zustand'

/**
 * "The user asked for another track and it has not started yet."
 *
 * Only a DELIBERATE switch goes in here — a tap on ⏭ / ⏮ or on a row. The
 * automatic hand-over at the end of a track is warmed ahead of time
 * (services/prefetch) and should look like nothing happened at all, so putting
 * a spinner on it would be noise. A tap, on the other hand, is a question the
 * app has to answer immediately, even when the answer is "fetching it".
 */

/** A switch that has not resolved by now is not going to; stop spinning. */
const STUCK_AFTER_MS = 20_000

interface TrackSwitchState {
  pending: boolean
  begin: () => void
  end: () => void
}

let stuckTimer: ReturnType<typeof setTimeout> | null = null

export const useTrackSwitchStore = create<TrackSwitchState>()((set) => ({
  pending: false,

  begin: () => {
    if (stuckTimer) clearTimeout(stuckTimer)
    // A timer, not a promise: the switch is finished by the PLAYER's state
    // (hooks/useLogTrackPlayerState), and the call that started it resolves
    // long before the first sample is out.
    stuckTimer = setTimeout(() => {
      stuckTimer = null
      set({pending: false})
    }, STUCK_AFTER_MS)
    set({pending: true})
  },

  end: () => {
    if (stuckTimer) {
      clearTimeout(stuckTimer)
      stuckTimer = null
    }
    set({pending: false})
  },
}))

/** Imperative twin, for code that is not a component (the skip buttons). */
export const beginTrackSwitch = () => useTrackSwitchStore.getState().begin()
export const endTrackSwitch = () => useTrackSwitchStore.getState().end()

export const useIsSwitchingTrack = () => useTrackSwitchStore((state) => state.pending)
