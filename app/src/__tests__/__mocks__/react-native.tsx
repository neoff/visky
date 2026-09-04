/**
 * React Native, as much of it as these tests touch.
 *
 * The real module binds to a bridge that does not exist in node. Everything
 * here is deliberately dumb: the host components render as themselves so
 * react-test-renderer can find them by name, and `Platform.OS` is writable
 * because half of what is under test branches on it.
 */
import React from 'react'

const host = (name: string) => {
  const Component = (props: any) => React.createElement(name, props, props.children)
  Component.displayName = name
  return Component
}

export const View = host('View')
export const Text = host('Text')
export const TouchableOpacity = host('TouchableOpacity')
export const Pressable = host('Pressable')
export const TextInput = host('TextInput')
export const ActivityIndicator = host('ActivityIndicator')
export const ScrollView = host('ScrollView')
export const StatusBar = host('StatusBar')
export const Image = {
  resolveAssetSource: () => ({uri: 'file:///bundle/unknown_track.png'}),
}
export const StyleSheet = {
  create: <T,>(styles: T): T => styles,
  flatten: (style: any) => style,
  absoluteFillObject: {},
}

/** Writable on purpose — tests set it to 'web' or 'ios' and re-import. */
export const Platform: {OS: string; select: (options: any) => any} = {
  OS: 'web',
  select: (options: any) => options[Platform.OS] ?? options.default ?? options.native,
}

type Listener = (...args: any[]) => void

class Emitter {
  private listeners = new Map<string, Set<Listener>>()

  addListener(event: string, listener: Listener) {
    const set = this.listeners.get(event) ?? new Set()
    set.add(listener)
    this.listeners.set(event, set)
    return {remove: () => set.delete(listener)}
  }

  emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args))
  }

  removeAllListeners(event?: string) {
    if (event) this.listeners.delete(event)
    else this.listeners.clear()
  }

  listenerCount(event: string) {
    return this.listeners.get(event)?.size ?? 0
  }
}

export const DeviceEventEmitter = new Emitter()
export class NativeEventEmitter extends Emitter {}
export const NativeModules: Record<string, any> = {}
export const AppRegistry = {registerHeadlessTask: () => undefined}
export const Dimensions = {get: () => ({width: 480, height: 900})}
export const PixelRatio = {get: () => 2, getFontScale: () => 1, roundToNearestPixel: (n: number) => n}
export const processColor = (color: any) => color

export const AppState = {
  currentState: 'active' as string,
  addEventListener: (_event: string, _handler: (state: string) => void) => ({
    remove: () => undefined,
  }),
}
export type AppStateStatus = string

export default {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  StyleSheet,
  DeviceEventEmitter,
  NativeEventEmitter,
  NativeModules,
  AppRegistry,
}
