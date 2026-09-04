/**
 * MMKV, which does not exist off a device.
 *
 * Every read throws, exactly as the real loader does on web when there is no
 * `NativeModules.MMKVStorage` to bind to — the condition that made the library
 * cache come back empty on the desktop and left the reconciler with no list.
 */
class MMKVInstance {
  getArrayAsync(): Promise<never> {
    return Promise.reject(new Error('MMKV is not available'))
  }
  getArray(): never {
    throw new Error('MMKV is not available')
  }
  setArray(): never {
    throw new Error('MMKV is not available')
  }
  getStringAsync(): Promise<null> {
    return Promise.resolve(null)
  }
  getString(): never {
    throw new Error('MMKV is not available')
  }
  setString(): never {
    throw new Error('MMKV is not available')
  }
}

export class MMKVLoader {
  withInstanceID() {
    return this
  }
  withEncryption() {
    return this
  }
  initialize() {
    return new MMKVInstance()
  }
}

export const useMMKVStorage = () => [undefined, () => undefined]
export default {MMKVLoader, useMMKVStorage}
