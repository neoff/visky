import React, {act} from 'react'
import TestRenderer from 'react-test-renderer'
// Imported by path, not by package name: the jest config maps the package
// to this very file, so it is the same module either way — and TypeScript can
// only see the fake's test helpers through the path.
import TrackPlayer, {__player, __reset} from '../__mocks__/trackPlayer'
import {PlayerProgressBar} from '@/components/PlayerProgressbar'

/**
 * Three separate faults lived in this component, all reported as one line:
 * "кликаю в миниплеере по таймингу плеера — то перематывает, то не
 * перематывает, а периодически срывается и вообще начинает играть следующий".
 */
const render = () => {
  let tree: TestRenderer.ReactTestRenderer
  act(() => {
    tree = TestRenderer.create(<PlayerProgressBar />)
  })
  return {
    tree: tree!,
    slider: () => tree!.root.findByType('Slider' as never).props as any,
  }
}

beforeEach(() => {
  __reset()
  __player.duration = 3_600
  __player.position = 120
  __player.buffered = 3_000
})

describe('the progress bar', () => {
  /**
   * react-native-awesome-slider fires `onSlidingComplete` for a TAP as well as
   * for a drag, but fires `onSlidingStart` only for the drag. The old handler
   * bailed out unless a slide had started, so a plain tap was dropped — the
   * "sometimes it seeks, sometimes it doesn't" half of the report.
   */
  it('seeks on a tap, which never fires onSlidingStart', async () => {
    const {slider} = render()

    await act(async () => {
      slider().onSlidingComplete(0.5)
    })

    expect(TrackPlayer.seekTo).toHaveBeenCalledWith(1_800)
  })

  it('seeks once at the end of a drag, not on every pixel of it', () => {
    const {slider} = render()

    // No value handler at all: the slider moves its own thumb, and a burst of
    // seeks — one per pixel — is what made playback tear and skip a track.
    expect(slider().onValueChange).toBeUndefined()
  })

  /**
   * Seeking to `duration` reads as "track finished" and the player answers by
   * advancing — which is how dragging to the right-hand edge started playing
   * something else.
   */
  it('never lands on the very end of the track', async () => {
    const {slider} = render()

    await act(async () => {
      slider().onSlidingComplete(1)
    })

    expect(TrackPlayer.seekTo).toHaveBeenCalledWith(3_599)
  })

  it('does not seek into a track that has not loaded', async () => {
    __player.duration = 0
    const {slider} = render()

    await act(async () => {
      slider().onSlidingComplete(0.5)
    })

    expect(TrackPlayer.seekTo).not.toHaveBeenCalled()
  })

  /**
   * After a seek the audio element keeps reporting the OLD second for a beat.
   * Letting that through yanks the bar back to where the drag started, which
   * reads as "the seek did nothing".
   */
  it('ignores the player\'s stale position until the seek lands', async () => {
    const {tree, slider} = render()

    await act(async () => {
      slider().onSlidingComplete(0.5)
    })
    expect(slider().progress.value).toBeCloseTo(0.5, 5)

    // the player is still answering with the position we seeked away from
    __player.position = 120
    await act(async () => {
      tree.update(<PlayerProgressBar />)
    })

    expect(slider().progress.value).toBeCloseTo(0.5, 5)

    // ...and once it has caught up, the bar follows again
    __player.position = 1_800
    await act(async () => {
      tree.update(<PlayerProgressBar />)
    })
    __player.position = 1_900
    await act(async () => {
      tree.update(<PlayerProgressBar />)
    })

    expect(slider().progress.value).toBeCloseTo(1_900 / 3_600, 5)
  })

  /**
   * "Белый прямоугольник справа внизу (вообще непонятный артефакт)."
   *
   * Measured off the screenshot: 33x29 at 60% alpha, the played-track colour,
   * exactly where a thumb at 100% would sit. `thumbWidth={0}` does not stop the
   * slider rendering the thumb's View, and that View carries the colour.
   */
  it('draws no thumb at all', () => {
    const {slider} = render()

    expect(slider().renderThumb()).toBeNull()
  })
})
