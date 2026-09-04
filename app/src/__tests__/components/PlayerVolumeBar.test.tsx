import React, {act} from 'react'
import TestRenderer from 'react-test-renderer'
import TrackPlayer, {__player, __reset} from '../__mocks__/trackPlayer'
import {PlayerVolumeBar} from '@/components/PlayerVolumeBar'

/**
 * This control was a mock: `const volume = 1.0` and an `updateVolume` that
 * wrote to the console. It drew itself at 100% for ever and dragging it did
 * nothing. It was also INVISIBLE in the desktop build, for a separate reason
 * recorded below.
 */
const render = async () => {
  let tree: TestRenderer.ReactTestRenderer
  await act(async () => {
    tree = TestRenderer.create(<PlayerVolumeBar />)
  })
  const root = tree!.root
  const buttons = root.findAllByType('TouchableOpacity' as never)
  const iconOf = (button: TestRenderer.ReactTestInstance) =>
    button.findByType('Ionicons' as never).props.name

  return {
    tree: tree!,
    slider: () => root.findByType('Slider' as never).props as any,
    // The nearest HOST <View> above the slider. `parent` walks through the
    // component wrappers as well, and it is the host element that carries the
    // style react-native-web would have applied.
    sliderWrapper: () => {
      let node: TestRenderer.ReactTestInstance | null = root.findByType('Slider' as never).parent
      while (node && (node.type as unknown) !== 'View') node = node.parent
      return node!.props as any
    },
    quieter: buttons.find((button) => iconOf(button) === 'volume-low')!.props as any,
    louder: buttons.find((button) => iconOf(button) === 'volume-high')!.props as any,
  }
}

beforeEach(() => {
  jest.useFakeTimers()
  __reset()
  __player.volume = 1
})

afterEach(() => {
  jest.useRealTimers()
})

describe('the volume bar', () => {
  /**
   * "Пропала полоска громкости."
   *
   * On web the slider wraps itself in a plain <div> for its hit slop, and
   * react-native-web does not style that div: as a flex item of a ROW it
   * shrinks to its intrinsic width, which is nothing. In a COLUMN the same div
   * is stretched to the full width instead.
   */
  it('puts the slider in a column, not in the row with the icons', async () => {
    const {sliderWrapper} = await render()

    expect(sliderWrapper().style.flexDirection).toBeUndefined()
    expect(sliderWrapper().style.flex).toBe(1)
  })

  it('draws neither a thumb nor a bubble', async () => {
    const {slider} = await render()

    expect(slider().renderThumb()).toBeNull()
    expect(slider().renderBubble()).toBeNull()
  })

  it('follows the finger while it is down', async () => {
    const {slider} = await render()

    await act(async () => {
      slider().onSlidingStart()
      slider().onValueChange(0.4)
    })

    expect(TrackPlayer.setVolume).toHaveBeenCalledWith(0.4)
  })
})

/**
 * "Раз ты починил громкость — то и кнопки тише/громче сделай активные."
 * ...and then: "если нажать и зажать на уменьшение — ничего не происходит."
 */
describe('the speaker icons', () => {
  it('move one notch per press', async () => {
    const {quieter, louder} = await render()

    await act(async () => {
      quieter.onPressIn()
      quieter.onPressOut()
    })
    expect(__player.volume).toBe(0.9)

    await act(async () => {
      louder.onPressIn()
      louder.onPressOut()
    })
    expect(__player.volume).toBe(1)
  })

  it('run the level while the finger stays down', async () => {
    const {quieter} = await render()

    await act(async () => {
      quieter.onPressIn()
    })
    expect(__player.volume).toBe(0.9)

    // the repeat starts after the hold delay, then a notch every tick
    await act(async () => {
      jest.advanceTimersByTime(350 + 120 * 4)
    })
    await act(async () => {
      quieter.onPressOut()
    })

    expect(__player.volume).toBeCloseTo(0.5, 5)
  })

  /**
   * Repeated steps drift into 0.7000000000000001 without rounding, and the bar
   * never lands cleanly on a tenth again.
   */
  it('lands on whole tenths', async () => {
    const {quieter} = await render()

    await act(async () => {
      quieter.onPressIn()
      jest.advanceTimersByTime(350 + 120 * 2)
      quieter.onPressOut()
    })

    expect(__player.volume).toBe(0.7)
  })

  it('stops at the rail instead of repeating into nothing', async () => {
    const {quieter} = await render()

    await act(async () => {
      quieter.onPressIn()
      jest.advanceTimersByTime(350 + 120 * 40)
      quieter.onPressOut()
    })
    const calls = TrackPlayer.setVolume.mock.calls.length

    expect(__player.volume).toBe(0)
    // ten notches down and then nothing: the interval cleared itself
    expect(calls).toBeLessThanOrEqual(10)
  })

  /**
   * A press that ends with the component unmounting — closing the player mid
   * hold — must not leave a timer nudging the volume from nowhere.
   */
  it('stops holding when the player is closed mid press', async () => {
    const {tree, quieter} = await render()

    await act(async () => {
      quieter.onPressIn()
    })
    await act(async () => {
      tree.unmount()
    })
    const after = TrackPlayer.setVolume.mock.calls.length

    await act(async () => {
      jest.advanceTimersByTime(5_000)
    })

    expect(TrackPlayer.setVolume.mock.calls.length).toBe(after)
  })
})
