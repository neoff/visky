import React, {act} from 'react'
import TestRenderer from 'react-test-renderer'
import {Text} from '../__mocks__/react-native'
// The web implementation is what jest resolves (the config is web-first), and
// it is the one under test: the desktop shell runs the web bundle.
import {PullToRefresh} from '@/components/PullToRefresh'

/**
 * "В телефонных апп можно сделать слайд даун и подгрузится обновление — на
 * десктопе такой функции нет."
 *
 * react-native-web's RefreshControl renders a View and drops `onRefresh`, so
 * the gesture had no equivalent at all in the browser or the Tauri shell.
 */
const THRESHOLD_PX = 90

// The component abandons a stalled pull on a timer. Left running, it fires
// after the test that armed it has finished and React complains about a state
// update outside `act`.
beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

const render = (props: Partial<React.ComponentProps<typeof PullToRefresh>> = {}) => {
  const onRefresh = props.onRefresh ?? jest.fn()
  const scrollY = {value: 0}
  let tree: TestRenderer.ReactTestRenderer
  act(() => {
    tree = TestRenderer.create(
      <PullToRefresh scrollY={scrollY as never} onRefresh={onRefresh} {...props}>
        <Text>list</Text>
      </PullToRefresh>,
    )
  })

  const wheel = (deltaY: number) => {
    act(() => {
      tree!.root.findByType('div' as never).props.onWheel({deltaY})
    })
  }

  return {tree: tree!, onRefresh, scrollY, wheel}
}

describe('the desktop pull-to-refresh', () => {
  it('reloads once the overscroll passes the threshold', () => {
    const {onRefresh, wheel} = render()

    wheel(-40)
    expect(onRefresh).not.toHaveBeenCalled()

    wheel(-60)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('ignores the wheel while the list is scrolled away from the top', () => {
    const {onRefresh, scrollY, wheel} = render()
    scrollY.value = 400

    wheel(-200)

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('does not reload again on the inertia that follows the gesture', () => {
    const {onRefresh, wheel} = render()

    wheel(-THRESHOLD_PX)
    // a trackpad keeps sending events after the finger lifts
    wheel(-30)
    wheel(-20)
    wheel(-10)

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('forgets a pull that was interrupted by an ordinary scroll down', () => {
    const {onRefresh, wheel} = render()

    wheel(-80)
    wheel(30)
    wheel(-80)

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('shows the spinner while the reload is on the network', () => {
    const {tree} = render({refreshing: true})

    expect(tree.root.findAllByType('ActivityIndicator' as never)).toHaveLength(1)
  })

  it('draws nothing at all while the list is simply sitting there', () => {
    const {tree} = render()

    expect(tree.root.findAllByType('ActivityIndicator' as never)).toHaveLength(0)
    expect(tree.root.findAllByType('Icon' as never)).toHaveLength(0)
  })
})
