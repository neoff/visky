import {beginTrackSwitch, endTrackSwitch, useTrackSwitchStore} from '@/store/trackSwitch'

/**
 * "Если я переключился на следующий трек кнопкой, чтоб это как-то обозначалось
 * (спинером), что он загружается."
 *
 * The flag is raised by the tap and lowered by the PLAYER — which is why it
 * also has to lower itself if the player never answers at all.
 */
beforeEach(() => {
  jest.useFakeTimers()
  endTrackSwitch()
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

const pending = () => useTrackSwitchStore.getState().pending

describe('the "switching track" flag', () => {
  it('is raised by the tap and lowered by the player', () => {
    beginTrackSwitch()
    expect(pending()).toBe(true)

    endTrackSwitch()
    expect(pending()).toBe(false)
  })

  it('gives up on its own when nothing ever starts', () => {
    beginTrackSwitch()

    jest.advanceTimersByTime(20_000)

    // A spinner that never stops is worse than no spinner: it says the app is
    // still working when it is not.
    expect(pending()).toBe(false)
  })

  it('restarts the timer for a second tap rather than inheriting the first', () => {
    beginTrackSwitch()
    jest.advanceTimersByTime(15_000)
    beginTrackSwitch()

    jest.advanceTimersByTime(10_000)
    expect(pending()).toBe(true)

    jest.advanceTimersByTime(10_000)
    expect(pending()).toBe(false)
  })
})
