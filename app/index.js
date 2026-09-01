/**
 * The app entry.
 *
 * On a phone `expo-router/entry` is the whole of it, and this file would not
 * need to exist. The extra line below is for Android Automotive.
 *
 * There, the car starts `CarBrowserService` from a cold boot with no Activity
 * and nothing else of ours alive. The service answers the browse request from
 * the cached tree, so the driver sees the playlist — and when they tap a track
 * it starts a headless JS runtime to play it. No component ever mounts in that
 * runtime, so neither of the two places that used to call `startCarLink()` runs:
 * not the root layout, which needs a mounted tree, and not the playback service,
 * which `useSetupTrackPlayer` only registers from a hook. The car would boot a
 * runtime and still find nobody listening, and the tap would go nowhere.
 *
 * Calling it here is safe rather than merely convenient: `startCarLink` is
 * idempotent, returns immediately when the native module is absent (web, and
 * any build older than the module), and its own comment says whichever call
 * lands first wins. This is simply the one call site that exists in every
 * runtime, headless or not.
 *
 * Import order matters — expo-router's entry registers the root component, and
 * this runs after it.
 */
import 'expo-router/entry'

import {startCarLink} from './src/services/car'

try {
	startCarLink()
} catch (error) {
	// An entry-point throw takes the whole app down, and the car link is not
	// worth that on a phone that has no head unit attached.
	console.warn('==car: link could not start at entry', error)
}
