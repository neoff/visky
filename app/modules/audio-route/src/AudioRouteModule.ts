import {requireOptionalNativeModule} from 'expo'
import type {NativeModule} from 'expo'
import type {AudioRouteEvents, AudioRouteSnapshot} from './AudioRoute.types'

/**
 * Reading the output route is easy on both platforms. CHANGING it is not, and
 * that shapes the whole API:
 *
 *   iOS   — an app cannot pick an output port. `overrideOutputAudioPort` only
 *           works in `playAndRecord`, and `setPreferredInput` is inputs only.
 *           The one supported route switcher is `AVRoutePickerView`, i.e. the
 *           system sheet.
 *   Android — media routing follows the audio device the framework picked;
 *           `setCommunicationDevice` is for calls, and the per-player override
 *           (`ExoPlayer.setPreferredAudioDevice`) lives inside
 *           react-native-track-player where we cannot reach it. The supported
 *           switcher is the system output panel (API 29+).
 *
 * So this module reports, and opens the OS picker. It never routes by itself —
 * an in-app list that only pretended to switch would be worse than no list.
 */

declare class AudioRouteNativeModule extends NativeModule<AudioRouteEvents> {
  getRoutes(): AudioRouteSnapshot
  presentOutputPicker(): Promise<boolean>
}

// Optional on purpose: the JS bundle reloads faster than the native binary is
// rebuilt, so a dev client from before `expo prebuild` must degrade, not crash.
const native = requireOptionalNativeModule<AudioRouteNativeModule>('AudioRoute')

const EMPTY: AudioRouteSnapshot = {current: null, available: [], canPresentPicker: false}

export const AudioRoute = {
  /** false on web, and on a native binary built before this module existed */
  isAvailable: native != null,

  getRoutes(): AudioRouteSnapshot {
    if (!native) return EMPTY
    try {
      return native.getRoutes()
    } catch (error) {
      console.warn('==audio-route: getRoutes failed', error)
      return EMPTY
    }
  },

  /** Opens the OS output picker. Resolves false when there is none to open. */
  async presentOutputPicker(): Promise<boolean> {
    if (!native) return false
    try {
      return await native.presentOutputPicker()
    } catch (error) {
      console.warn('==audio-route: presentOutputPicker failed', error)
      return false
    }
  },

  addRouteListener(listener: (snapshot: AudioRouteSnapshot) => void): {remove: () => void} {
    if (!native) return {remove: () => {}}
    return native.addListener('onRouteChange', listener)
  },
}
