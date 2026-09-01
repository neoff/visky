import {Asset} from 'expo-asset'
import unknownTrackImage from '@/assets/unknown_track.png'

/**
 * The web/desktop twin of `constants/images.ts`.
 *
 * The native file uses `Image.resolveAssetSource`, which react-native-web does
 * not implement — the call threw while the module was still being evaluated, so
 * nothing downstream of it ever ran and the whole bundle died on a white screen
 * before the first paint.
 *
 * `Asset.fromModule` is Expo's own resolver and is the supported way to turn a
 * bundled asset into a url on every platform, web included.
 */
export const unknownTrackImageUri = Asset.fromModule(unknownTrackImage).uri
