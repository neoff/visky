import React, {PropsWithChildren, useCallback, useEffect, useRef} from 'react'
import {Dimensions, StyleSheet} from 'react-native'
import {Gesture, GestureDetector} from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

/**
 * Pull the screen down to close it — the desktop half.
 *
 * `gestureEnabled` on a Stack.Screen is a native-stack feature: react-navigation
 * has no swipe-to-dismiss on web, so on the desktop build the player could only
 * be closed with the chevron and the gesture the app teaches everywhere else
 * did nothing.
 *
 * Two inputs, because a Mac has two ways to "swipe down" and the app should not
 * care which one the user reaches for:
 *
 *   * a press-and-drag (mouse, or a trackpad click-drag) — the Pan handler;
 *   * a two-finger swipe, which the browser reports as a wheel event and no
 *     pointer at all — the listener below.
 *
 * Both feed the same offset, so the screen follows the finger either way and
 * springs back when the pull was not enough.
 */

/** How far down the screen has to travel before letting go closes it. */
const DISMISS_DISTANCE = 110
/** ...or how fast, so a short flick counts too. */
const DISMISS_VELOCITY = 800
/** A wheel gesture is over once this long has passed without a new event. */
const WHEEL_IDLE_MS = 120

export const SwipeToDismiss = ({
  onDismiss,
  children,
}: PropsWithChildren<{onDismiss: () => void}>) => {
  const offset = useSharedValue(0)
  // router.dismiss() must run exactly once: the wheel timer and the pan handler
  // can both decide to close within the same frame.
  const closed = useRef(false)

  const close = useCallback(() => {
    if (closed.current) return
    closed.current = true
    onDismiss()
  }, [onDismiss])

  const fallAway = useCallback(() => {
    const height = Dimensions.get('window').height
    offset.value = withTiming(height, {duration: 180}, (finished) => {
      if (finished) runOnJS(close)()
    })
  }, [close, offset])

  const springBack = useCallback(() => {
    offset.value = withTiming(0, {duration: 160})
  }, [offset])

  const pan = Gesture.Pan()
    // Downward only, and only after a deliberate 10px: a click on a control
    // must stay a click.
    .activeOffsetY(10)
    .failOffsetY(-10)
    .onUpdate((event) => {
      offset.value = Math.max(0, event.translationY)
    })
    .onEnd((event) => {
      const far = event.translationY > DISMISS_DISTANCE
      const fast = event.velocityY > DISMISS_VELOCITY
      if (far || fast) runOnJS(fallAway)()
      else runOnJS(springBack)()
    })

  useEffect(() => {
    let idle: ReturnType<typeof setTimeout> | null = null
    let travelled = 0

    const onWheel = (event: WheelEvent) => {
      // A two-finger swipe DOWN scrolls the content down, which is a NEGATIVE
      // deltaY (macOS "natural" scrolling, on by default). An upward swipe is
      // positive and is ignored — the screen never lifts above its own top.
      travelled = Math.max(0, travelled - event.deltaY)
      offset.value = travelled

      if (idle) clearTimeout(idle)
      idle = setTimeout(() => {
        if (travelled > DISMISS_DISTANCE) fallAway()
        else springBack()
        travelled = 0
      }, WHEEL_IDLE_MS)
    }

    // On window rather than on this view: the player is the whole screen while
    // it is mounted, and reading the DOM node out of an Animated.View to attach
    // a listener to it is the kind of indirection that quietly stops working.
    window.addEventListener('wheel', onWheel, {passive: true})
    return () => {
      window.removeEventListener('wheel', onWheel)
      if (idle) clearTimeout(idle)
    }
  }, [fallAway, offset, springBack])

  const style = useAnimatedStyle(() => ({transform: [{translateY: offset.value}]}))

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>
    </GestureDetector>
  )
}
