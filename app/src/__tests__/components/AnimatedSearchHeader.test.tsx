import React, {act} from 'react'
import TestRenderer from 'react-test-renderer'
import {Platform} from '../__mocks__/react-native'
import {AnimatedSearchHeader} from '@/components/AnimatedSearchHeader'

/**
 * "Как обновить плейлист в десктопе? В мобильном это принудительный драг
 * плейлиста вниз."
 *
 * There was no way. react-native-web's `RefreshControl` is a stub — it renders
 * a plain View and DROPS `onRefresh` — so the gesture the app teaches
 * everywhere else has no equivalent on the desktop, and the list could only be
 * reloaded by restarting the app.
 */
const render = (props: Record<string, unknown>) => {
  let tree: TestRenderer.ReactTestRenderer
  act(() => {
    tree = TestRenderer.create(<AnimatedSearchHeader title="Songs" {...props} />)
  })
  const buttons = tree!.root.findAllByType('TouchableOpacity' as never)
  return {
    tree: tree!,
    refresh: buttons.find((button) => button.props.accessibilityLabel === 'Refresh'),
  }
}

afterEach(() => {
  Platform.OS = 'web'
})

describe('the refresh control', () => {
  it('is there on the desktop, where there is no pull to refresh', () => {
    Platform.OS = 'web'
    const onRefresh = jest.fn()

    const {refresh} = render({onRefresh})
    act(() => {
      refresh!.props.onPress()
    })

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('is not there on a phone, where the pull IS the control', () => {
    Platform.OS = 'ios'

    const {refresh} = render({onRefresh: jest.fn()})

    expect(refresh).toBeUndefined()
  })

  it('is not drawn for a screen that has nothing to reload', () => {
    Platform.OS = 'web'

    const {refresh} = render({})

    expect(refresh).toBeUndefined()
  })

  it('shows the reload running, and cannot be pressed twice', () => {
    Platform.OS = 'web'

    const {tree, refresh} = render({onRefresh: jest.fn(), refreshing: true})

    expect(refresh!.props.disabled).toBe(true)
    expect(tree.root.findAllByType('ActivityIndicator' as never)).toHaveLength(1)
  })

  /**
   * The search row collapses to zero height as the list scrolls, and reloading
   * is exactly what you reach for after scrolling — so the button lives beside
   * the title instead.
   */
  it('sits beside the title, not in the row that collapses', () => {
    Platform.OS = 'web'

    const {tree, refresh} = render({onRefresh: jest.fn()})
    const titles = tree.root.findAllByType('Text' as never)

    expect(refresh).toBeDefined()
    expect(titles[0].props.children).toBe('Songs')
    // same parent row as the title, which stays on screen
    expect(refresh!.parent!.parent!.props.style.justifyContent).toBe('space-between')
  })
})
