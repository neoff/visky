import unknownTrackImage from '@/assets/unknown_track.png'
import { Image } from 'react-native'

/**
 * A RENDER default, never track data.
 *
 * `Image.resolveAssetSource` answers with a path inside THIS install's bundle
 * (`file:///.../<uuid>/visky.app/assets/...`), so writing it into a track is
 * three bugs at once: it travels to the account's other devices, where that
 * path means nothing; it goes stale the moment the app is reinstalled and the
 * bundle uuid changes; and react-native-track-player hands it to the lock
 * screen and CarPlay as the track's cover, which is why a re-resolved track
 * showed no artwork in either. A track with no cover carries no `artwork` at
 * all -- the views fall back to this on their own.
 */
export const unknownTrackImageUri = Image.resolveAssetSource(unknownTrackImage).uri
