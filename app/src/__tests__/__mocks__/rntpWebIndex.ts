/**
 * The package index, as the web player imports it (`../../src`).
 *
 * Imported for one enum. Following it for real runs the whole package back
 * through its own web entry point, which imports the very module that is asking
 * — a cycle that leaves `PlaylistPlayer` undefined at the moment
 * `TrackPlayerModule` extends it. The enum is all the class under test needs.
 */
export enum State {
  None = 'none',
  Ready = 'ready',
  Playing = 'playing',
  Paused = 'paused',
  Stopped = 'stopped',
  Buffering = 'buffering',
  Ended = 'ended',
  Error = 'error',
}
