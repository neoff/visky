/**
 * Where the sound leaves THIS device — the speaker, the headphones, a Bluetooth
 * set. Not to be confused with `PlaybackDeviceInfo`, which is a whole other
 * phone/laptop signed into the same account.
 */

export type AudioRouteKind =
  | 'speaker'
  | 'headphones'
  | 'bluetooth'
  | 'usb'
  | 'hdmi'
  | 'car'
  | 'airplay'
  | 'unknown'

export interface AudioRoute {
  /** stable per connected device: the port uid (iOS) or AudioDeviceInfo id (Android) */
  id: string
  name: string
  kind: AudioRouteKind
}

export interface AudioRouteSnapshot {
  /** the output the sound is going to right now, as far as the OS will say */
  current: AudioRoute | null
  /** everything currently connected and usable for media */
  available: AudioRoute[]
  /**
   * Whether the OS has a picker we can open. False on web, and on an Android
   * older than 29 where there is no output panel to open.
   */
  canPresentPicker: boolean
}

export type AudioRouteEvents = {
  onRouteChange: (snapshot: AudioRouteSnapshot) => void
}
