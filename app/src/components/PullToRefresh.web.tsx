import React, {useCallback, useEffect, useRef, useState} from 'react'
import {ActivityIndicator, View, StyleSheet} from 'react-native'
import {Ionicons} from '@expo/vector-icons'
import {colors} from '@/constants'
import type {PullToRefreshProps} from './PullToRefresh'

/**
 * The desktop's answer to a swipe down.
 *
 * react-native-web's `RefreshControl` is a stub: it renders a plain View and
 * DROPS `onRefresh`, so the gesture every phone build teaches has no equivalent
 * in the browser or in the Tauri shell. The header carries a refresh button for
 * that reason, but a button is not what a hand reaches for after scrolling — it
 * keeps scrolling up, the list is already at the top, and nothing happens.
 *
 * So the overscroll is caught here. A trackpad two-finger drag downwards (and a
 * mouse wheel) arrives as `wheel` events with a negative deltaY; once the list
 * is at the top those have nowhere to go, and they are accumulated into a pull
 * instead. Past the threshold the list reloads, exactly as the phone's gesture
 * does.
 */

/** How far the overscroll has to travel before it counts. */
const THRESHOLD_PX = 90

/** How far the indicator is allowed to travel, so it cannot walk off screen. */
const MAX_PULL_PX = 120

/** A pull that stalls for this long is abandoned rather than continued. */
const IDLE_RESET_MS = 350

/** Scroll offsets under this still count as "at the top" (sub-pixel scrolls). */
const AT_TOP_PX = 1

export const PullToRefresh = ({
  scrollY,
  onRefresh,
  refreshing = false,
  topOffset = 0,
  children,
}: PullToRefreshProps) => {
  const [pull, setPull] = useState(0)
  const pullRef = useRef(0)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Latched for the rest of the gesture: a trackpad keeps sending events after
  // the finger lifts (inertia), and without this every one of them would fire
  // another reload.
  const fired = useRef(false)

  const settle = useCallback((next: number) => {
    pullRef.current = next
    setPull(next)
  }, [])

  useEffect(() => {
    if (!refreshing) return
    // the answer is on its way; the rubber band has done its job
    settle(0)
  }, [refreshing, settle])

  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
  }, [])

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      // Scrolling DOWN, or not at the top: an ordinary scroll, and any pull
      // collected so far is not a pull after all.
      const atTop = (scrollY?.value ?? 0) <= AT_TOP_PX
      if (event.deltaY >= 0 || !atTop) {
        fired.current = false
        if (pullRef.current !== 0) settle(0)
        return
      }

      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => {
        fired.current = false
        settle(0)
      }, IDLE_RESET_MS)

      if (fired.current || refreshing) return

      const next = Math.min(pullRef.current - event.deltaY, MAX_PULL_PX)
      settle(next)

      if (next >= THRESHOLD_PX) {
        fired.current = true
        settle(0)
        onRefresh()
      }
    },
    [onRefresh, refreshing, scrollY, settle],
  )

  const ready = pull >= THRESHOLD_PX
  const visible = refreshing || pull > 0

  return (
    <div
      onWheel={handleWheel}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
      }}
    >
      {visible && (
        <View
          pointerEvents="none"
          style={[
            styles.indicatorRow,
            {
              top: topOffset + 8,
              // follows the pull, the way the phone's spinner follows the finger
              transform: [{translateY: refreshing ? 0 : Math.min(pull, MAX_PULL_PX) / 3}],
              opacity: refreshing ? 1 : Math.min(pull / THRESHOLD_PX, 1),
            },
          ]}
        >
          <View style={styles.indicator}>
            {refreshing ? (
              <ActivityIndicator color={colors.text} size="small"/>
            ) : (
              <Ionicons
                name={ready ? 'refresh' : 'arrow-down'}
                size={18}
                color={ready ? colors.primary : colors.text}
              />
            )}
          </View>
        </View>
      )}
      {children}
    </div>
  )
}

const styles = StyleSheet.create({
  // Full width and centred on its own: an absolutely positioned box has no
  // parent row to be centred BY, so `alignSelf` would do nothing here.
  indicatorRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  // A plate rather than a bare glyph: it hangs over the list, and the rows
  // behind it are text on black.
  indicator: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
})
