/**
 * The row's two gestures, and the heart that is no longer a button.
 *
 * "из листинга убери пустое сердечко, добавить в избранное давай сделаем
 * свайпом вправо … удаления из избранного свайп влево. сердечко — чисто
 * информативное, показывает только то что уже в избранном."
 *
 * So: no outline on a row that is not a favourite, a right swipe that offers
 * "add" only where adding means something, and a left swipe that offers
 * "remove" only where there is something to remove.
 */
import React, {act} from 'react'
import TestRenderer from 'react-test-renderer'
import {Platform} from '../__mocks__/react-native'
import {__closes as closes} from '../__mocks__/swipeable'

const mockToggle = jest.fn()
let mockFavorite = false

jest.mock('@/store/favorites', () => ({
  useIsFavorite: () => mockFavorite,
  useToggleFavorite: () => mockToggle,
}))
jest.mock('@/store/played', () => ({useIsPlayed: () => false}))
jest.mock('react-native-track-player', () => ({
  // the rest of the fake player stays: `constants` reads RepeatMode off it at
  // import time, and a bare object would take the whole module down
  ...jest.requireActual('react-native-track-player'),
  useActiveTrack: () => undefined,
  useIsPlaying: () => ({playing: false, bufferingDuringPlay: false}),
}))

import {TrackListItem} from '@/components/TrackListItem'

const TRACK = {
  id: 1,
  owner_id: -42311167,
  url: 'https://vk/audio.m3u8',
  title: 'Tech Coast Tribal',
  artist: 'El Reyalto',
  date: '1462492800',
}

const render = (props: Partial<React.ComponentProps<typeof TrackListItem>> = {}) => {
  let tree: TestRenderer.ReactTestRenderer
  act(() => {
    tree = TestRenderer.create(
      <TrackListItem track={TRACK as any} onTrackSelect={jest.fn()} {...props}/>,
    )
  })
  return tree!
}

const swipeable = (tree: TestRenderer.ReactTestRenderer) => tree.root.findByType('Swipeable' as any).props

beforeEach(() => {
  jest.clearAllMocks()
  closes.length = 0
  mockFavorite = false
  Platform.OS = 'ios'
})

describe('a track that is not a favourite', () => {
  it('shows no heart at all', () => {
    const tree = render()
    expect(tree.root.findAllByType('FontAwesome' as any).filter((node) => node.props.name === 'heart-o'))
      .toHaveLength(0)
  })

  it('offers "add" on a right swipe and nothing on a left one', () => {
    const {renderLeftActions, renderRightActions} = swipeable(render())
    expect(typeof renderLeftActions).toBe('function')
    expect(renderRightActions).toBeUndefined()
  })

  /**
   * The swipe IS the action. The first version revealed a button and waited for
   * a tap on it: on the desktop the row just stayed open, nothing was added and
   * it did not come back.
   */
  it('adds on the swipe itself, with nothing left to tap', () => {
    const tree = render()
    const {onSwipeableWillOpen, renderLeftActions} = swipeable(tree)

    act(() => {
      onSwipeableWillOpen()
    })

    expect(mockToggle).toHaveBeenCalledWith(TRACK)
    // the panel underneath is scenery: no press handler anywhere in it
    let panel: TestRenderer.ReactTestRenderer
    act(() => {
      panel = TestRenderer.create(renderLeftActions())
    })
    expect(panel!.root.findAllByType('Pressable' as any)).toHaveLength(0)
  })

  it('closes itself on the next frame, so the row comes back', () => {
    jest.useFakeTimers()
    const tree = render()

    act(() => {
      swipeable(tree).onSwipeableWillOpen()
    })

    // NOT in the same tick as the open: the spring would be asked to do two
    // things at once, which is how the row got stuck half-open
    expect(closes).toHaveLength(0)
    act(() => {
      jest.runAllTimers()
    })
    expect(closes).toHaveLength(1)

    jest.useRealTimers()
  })
})

describe('a track that is one', () => {
  beforeEach(() => {
    mockFavorite = true
  })

  it('lights the heart', () => {
    const tree = render()
    expect(tree.root.findAllByType('FontAwesome' as any).filter((node) => node.props.name === 'heart'))
      .not.toHaveLength(0)
  })

  it('offers "remove" on a left swipe and nothing on a right one', () => {
    const {renderLeftActions, renderRightActions} = swipeable(render())
    expect(renderLeftActions).toBeUndefined()
    expect(typeof renderRightActions).toBe('function')
  })

  /**
   * "в фэйворитс убери сердечки (мы и так в фэйворитс)."
   * The list that IS the favourites draws none — the swipe still takes a row
   * out of it.
   */
  it('draws no heart at all in a list that is the favourites', () => {
    const tree = render({showFavorite: false})

    expect(tree.root.findAllByType('FontAwesome' as any).filter((node) => node.props.name === 'heart'))
      .toHaveLength(0)
    expect(typeof swipeable(tree).renderRightActions).toBe('function')
  })

  it('leaves the heart inert on a touch screen', () => {
    const tree = render()
    const heart = tree.root
      .findAllByType('Pressable' as any)
      .find((node) => node.props.accessibilityLabel === 'In your favorites')
    expect(heart?.props.onPress).toBeUndefined()
    expect(heart?.props.disabled).toBe(true)
  })
})

describe('on the desktop, where there is no swipe to discover', () => {
  beforeEach(() => {
    Platform.OS = 'web'
  })

  it('keeps the heart a button once the row is hovered', () => {
    const tree = render()
    act(() => {
      tree.root.findByType('View' as any).props.onPointerEnter()
    })

    const heart = tree.root
      .findAllByType('Pressable' as any)
      .find((node) => node.props.accessibilityLabel === 'Add to favorites')
    expect(heart).toBeDefined()

    act(() => {
      heart!.props.onPress()
    })
    expect(mockToggle).toHaveBeenCalledWith(TRACK)
  })
})
