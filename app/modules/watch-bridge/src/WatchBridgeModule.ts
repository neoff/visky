import {requireOptionalNativeModule} from 'expo'
import type {NativeModule} from 'expo'
import type {
  WatchBridgeEvents,
  WatchCommand,
  WatchSnapshot,
  WatchStatus,
} from './WatchBridge.types'

/**
 * WatchConnectivity, from JS.
 *
 * Two channels, and both are needed for different reasons:
 *
 *  - `updateApplicationContext` — ONE pending payload, replaced each time,
 *    delivered whenever the watch next wakes. This is what makes the watch show
 *    the right track after being in a pocket for an hour.
 *  - `sendMessage` — immediate, but only while the watch app is reachable
 *    (foreground). This is what makes a tap on the phone move the watch UI now.
 *
 * Sending only the context is laggy; sending only messages loses everything the
 * moment the wrist drops. The native side does both and the watch takes
 * whichever arrives.
 */

declare class WatchBridgeNativeModule extends NativeModule<WatchBridgeEvents> {
  getStatus(): WatchStatus
  publish(snapshot: WatchSnapshot): Promise<boolean>
}

const native = requireOptionalNativeModule<WatchBridgeNativeModule>('WatchBridge')

const UNSUPPORTED: WatchStatus = {
  supported: false,
  paired: false,
  installed: false,
  reachable: false,
}

export const WatchBridge = {
  /** false on Android, on web, and on an iOS binary built before this module */
  isAvailable: native != null,

  getStatus(): WatchStatus {
    if (!native) return UNSUPPORTED
    try {
      return native.getStatus()
    } catch (error) {
      console.warn('==watch: getStatus failed', error)
      return UNSUPPORTED
    }
  },

  async publish(snapshot: WatchSnapshot): Promise<boolean> {
    if (!native) return false
    try {
      return await native.publish(snapshot)
    } catch (error) {
      console.warn('==watch: publish failed', error)
      return false
    }
  },

  addCommandListener(listener: (command: WatchCommand) => void): {remove: () => void} {
    if (!native) return {remove: () => {}}
    return native.addListener('onWatchCommand', listener)
  },

  addStatusListener(listener: (status: WatchStatus) => void): {remove: () => void} {
    if (!native) return {remove: () => {}}
    return native.addListener('onWatchStatus', listener)
  },
}
