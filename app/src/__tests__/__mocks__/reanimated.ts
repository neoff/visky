/**
 * Reanimated's shared values, as plain boxes.
 *
 * The library needs a worklet runtime and a native thread; what the components
 * under test do with it is write `.value` and hand the box to the slider, and
 * a box is all that takes. `useSharedValue` is deliberately NOT a hook here —
 * it keeps one box per call site through the render, which is what a test that
 * re-renders needs to see.
 */
import {createElement, useRef} from 'react'

export const useSharedValue = <T,>(initial: T) => useRef({value: initial}).current
export const useAnimatedStyle = (factory: () => any) => factory()

/** The identity of an animation that has not started: the value at input 0. */
export const interpolate = (_value: number, _input: number[], output: number[]) => output[0]
export const Extrapolation = {CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity'}
export type SharedValue<T> = {value: T}
/**
 * Runs the completion callback straight away.
 *
 * The real animation calls it on the UI thread when the tween finishes, and the
 * pull-to-close gesture only navigates from inside that callback — so a mock
 * that swallowed it would make the screen never close.
 */
export const withTiming = (value: any, _config?: any, callback?: (finished: boolean) => void) => {
  callback?.(true)
  return value
}
export const withSpring = (value: any) => value
export const runOnJS = (fn: any) => fn
const AnimatedView = (props: any) =>
  createElement('Animated.View', props, props.children)

export default {
  View: AnimatedView,
  interpolate,
  Extrapolation,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
}
