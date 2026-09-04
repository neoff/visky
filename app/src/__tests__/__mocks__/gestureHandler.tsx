/**
 * react-native-gesture-handler, reduced to the builder shape.
 *
 * The real thing needs a native view manager. The pan handler's callbacks are
 * recorded so a test can fire them the way a finger would.
 */
import React from 'react'

export type PanRecorder = {
  onUpdate?: (event: any) => void
  onEnd?: (event: any) => void
}

export const __lastPan: PanRecorder = {}

const panBuilder = () => {
  const builder: any = {
    activeOffsetY: () => builder,
    failOffsetY: () => builder,
    onUpdate: (fn: any) => {
      __lastPan.onUpdate = fn
      return builder
    },
    onEnd: (fn: any) => {
      __lastPan.onEnd = fn
      return builder
    },
  }
  return builder
}

export const Gesture = {Pan: panBuilder}

export const GestureDetector = ({children}: {children?: React.ReactNode}) =>
  React.createElement('GestureDetector', null, children)
