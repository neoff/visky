/**
 * react-native-awesome-slider, reduced to the props it is given.
 *
 * The real slider needs a gesture handler and a layout pass. What the tests
 * need is the callbacks: they render as a host element called `Slider` so a
 * test can find it and fire `onSlidingComplete` the way a TAP does — without
 * `onSlidingStart`, which is the distinction the progress bar used to get
 * wrong.
 */
import React from 'react'

export const Slider = (props: any) => React.createElement('Slider', props)
export default {Slider}
