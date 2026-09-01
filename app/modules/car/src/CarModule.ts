import {requireOptionalNativeModule} from 'expo'
import type {NativeModule} from 'expo'
import type {CarCommand, CarEvents, CarStatus, CarTree} from './Car.types'

/**
 * CarPlay and Android Auto, from JS, behind one facade.
 *
 * The two platforms share nothing in their native APIs — CarPlay is a UIScene
 * full of CPTemplates, Android Auto is a MediaBrowserService answering the
 * system — but from here they are the same object: push a tree, receive taps.
 * Everything platform-shaped stays in the native halves.
 *
 * `isAvailable` is false on web, and false on any binary built before this
 * module existed, which is why the native module is required optionally. It
 * does NOT mean a head unit is attached — see `CarStatus.connected` for that.
 */

declare class CarNativeModule extends NativeModule<CarEvents> {
  getStatus(): CarStatus
  publishTree(tree: CarTree): Promise<boolean>
}

const native = requireOptionalNativeModule<CarNativeModule>('Car')

const DISCONNECTED: CarStatus = {connected: false}

export const Car = {
  isAvailable: native != null,

  getStatus(): CarStatus {
    if (!native) return DISCONNECTED
    try {
      return native.getStatus()
    } catch (error) {
      console.warn('==car: getStatus failed', error)
      return DISCONNECTED
    }
  },

  async publishTree(tree: CarTree): Promise<boolean> {
    if (!native) return false
    try {
      return await native.publishTree(tree)
    } catch (error) {
      console.warn('==car: publishTree failed', error)
      return false
    }
  },

  addCommandListener(listener: (command: CarCommand) => void): {remove: () => void} {
    if (!native) return {remove: () => {}}
    return native.addListener('onCarCommand', listener)
  },

  addStatusListener(listener: (status: CarStatus) => void): {remove: () => void} {
    if (!native) return {remove: () => {}}
    return native.addListener('onCarStatus', listener)
  },
}
