import React, {act} from 'react'
import TestRenderer from 'react-test-renderer'
import {Platform} from '../__mocks__/react-native'
import {AnimatedSearchHeader} from '@/components/AnimatedSearchHeader'

/**
 * "Как обновить плейлист в десктопе? В мобильном это принудительный драг
 * плейлиста вниз."
 *
 * The answer used to be a button beside the title, drawn on web only, because
 * react-native-web's `RefreshControl` is a stub that drops `onRefresh`.
 * `PullToRefresh.web` since turned the trackpad overscroll into the same
 * gesture the phones have — and then there were two controls for one thing,
 * with two spinners on screen at once while a list loaded.
 *
 * The button is gone. These tests pin that it stays gone, and that the header
 * still does the rest of its job.
 */
const render = (props: Record<string, unknown> = {}) => {
  let tree: TestRenderer.ReactTestRenderer
  act(() => {
    tree = TestRenderer.create(<AnimatedSearchHeader title="Songs" {...props} />)
  })
  return tree!
}

afterEach(() => {
  Platform.OS = 'web'
})

describe('the header', () => {
  it('draws no refresh button on the desktop — the overscroll IS the control', () => {
    Platform.OS = 'web'

    const tree = render()

    const buttons = tree.root.findAllByType('TouchableOpacity' as never)
    expect(buttons.find((button) => button.props.accessibilityLabel === 'Refresh')).toBeUndefined()
    // and nothing is spinning in the header while a list loads
    expect(tree.root.findAllByType('ActivityIndicator' as never)).toHaveLength(0)
  })

  it('draws none on a phone either', () => {
    Platform.OS = 'ios'

    const tree = render()

    expect(tree.root.findAllByType('TouchableOpacity' as never)).toHaveLength(0)
  })

  it('shows the title and reports what is typed', () => {
    const changes: string[] = []
    const tree = render({onSearchChange: (text: string) => changes.push(text)})

    const titles = tree.root.findAllByType('Text' as never)
    expect(titles[0].props.children).toBe('Songs')

    act(() => {
      tree.root.findByType('TextInput' as never).props.onChangeText('reyalto')
    })
    expect(changes).toEqual(['reyalto'])
  })

  it('renders the action given to it, beside the search box', () => {
    const tree = render({action: <TestAction/>})

    expect(tree.root.findAllByType(TestAction)).toHaveLength(1)
  })
})

const TestAction = () => null
