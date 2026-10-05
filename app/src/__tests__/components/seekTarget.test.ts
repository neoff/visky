import {seekTarget} from '@/components/PlayerProgressbar'

/**
 * Issue #6: "при клике на таймлайн продолжает играть с того места где играло".
 *
 * The seek is arithmetic on a duration the player reports, and a media element
 * does not always report a number. WKWebView — which is what the desktop shell
 * runs, playing VK's HLS natively — answers `Infinity` for a stream it treats
 * as unfinished, and the old code multiplied by it: the player was handed
 * `Infinity` and ignored the request, while `duration > 0` happily let it
 * through because `Infinity > 0` is true.
 */
describe('where a tap on the progress bar lands', () => {
  it('is the fraction of the track', () => {
    expect(seekTarget(0.5, 3600)).toBe(1800)
  })

  it('stops short of the very end, which the player reads as "finished"', () => {
    expect(seekTarget(1, 3600)).toBe(3599)
  })

  it('clamps a negative fraction to the start', () => {
    expect(seekTarget(-0.2, 3600)).toBe(0)
  })

  it('refuses an infinite duration instead of seeking to infinity', () => {
    expect(seekTarget(0.5, Infinity)).toBeNull()
  })

  it('refuses a duration that is not a number at all', () => {
    expect(seekTarget(0.5, NaN)).toBeNull()
  })

  it('refuses a track that has no length yet', () => {
    expect(seekTarget(0.5, 0)).toBeNull()
  })

  it('refuses a fraction that is not a number, rather than seeking to NaN', () => {
    expect(seekTarget(NaN, 3600)).toBeNull()
  })
})
