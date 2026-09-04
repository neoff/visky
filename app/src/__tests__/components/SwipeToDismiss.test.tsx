import React, {act} from 'react'
import TestRenderer from 'react-test-renderer'
import {__lastPan} from '../__mocks__/gestureHandler'
import {SwipeToDismiss} from '@/components/SwipeToDismiss'

/**
 * "В миниплеере не работают жесты — при смахивании вниз миниплеер не
 * скрывается."
 *
 * `gestureEnabled` on a Stack.Screen is a native-stack feature: react-navigation
 * has no swipe-to-dismiss on web, so on the desktop the player could only be
 * closed with the chevron and the gesture the app teaches everywhere else did
 * nothing at all.
 */
let wheel: ((event: {deltaY: number}) => void) | null = null

const render = (onDismiss: () => void) => {
  act(() => {
    TestRenderer.create(<SwipeToDismiss onDismiss={onDismiss} />)
  })
}

beforeEach(() => {
  jest.useFakeTimers()
  wheel = null
  ;(globalThis as {window?: unknown}).window = {
    addEventListener: (event: string, handler: never) => {
      if (event === 'wheel') wheel = handler
    },
    removeEventListener: () => undefined,
  }
})

afterEach(() => {
  jest.useRealTimers()
  delete (globalThis as {window?: unknown}).window
})

/**
 * A Mac has two ways to "swipe down" and the app should not care which one the
 * user reaches for.
 */
describe('a two-finger swipe', () => {
  it('closes the screen when it is pulled far enough', () => {
    const onDismiss = jest.fn()
    render(onDismiss)

    act(() => {
      // A downward two-finger swipe scrolls the content down, which is a
      // NEGATIVE deltaY under macOS natural scrolling — on by default.
      wheel!({deltaY: -80})
      wheel!({deltaY: -80})
      jest.advanceTimersByTime(200)
    })

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('springs back when the pull was short', () => {
    const onDismiss = jest.fn()
    render(onDismiss)

    act(() => {
      wheel!({deltaY: -40})
      jest.advanceTimersByTime(200)
    })

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('ignores an upward swipe — the screen never lifts above its own top', () => {
    const onDismiss = jest.fn()
    render(onDismiss)

    act(() => {
      wheel!({deltaY: 400})
      jest.advanceTimersByTime(200)
    })

    expect(onDismiss).not.toHaveBeenCalled()
  })
})

describe('a press and drag', () => {
  it('closes the screen when it is dragged past the threshold', () => {
    const onDismiss = jest.fn()
    render(onDismiss)

    act(() => {
      __lastPan.onUpdate!({translationY: 150})
      __lastPan.onEnd!({translationY: 150, velocityY: 0})
    })

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('closes on a short flick, because speed counts too', () => {
    const onDismiss = jest.fn()
    render(onDismiss)

    act(() => {
      __lastPan.onEnd!({translationY: 30, velocityY: 1_200})
    })

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('springs back from a slow, short drag', () => {
    const onDismiss = jest.fn()
    render(onDismiss)

    act(() => {
      __lastPan.onUpdate!({translationY: 40})
      __lastPan.onEnd!({translationY: 40, velocityY: 10})
    })

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('closes exactly once when the wheel timer and the drag agree', () => {
    // Both can decide to close within the same frame, and `router.dismiss()`
    // must run once.
    const onDismiss = jest.fn()
    render(onDismiss)

    act(() => {
      wheel!({deltaY: -200})
      __lastPan.onEnd!({translationY: 200, velocityY: 0})
      jest.advanceTimersByTime(200)
    })

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
