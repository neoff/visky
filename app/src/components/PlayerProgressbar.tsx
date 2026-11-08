import {useCallback, useEffect, useRef} from "react";
import {View, Text, ViewProps, Pressable, StyleSheet} from "react-native";
import TrackPlayer, {useActiveTrack, useProgress} from "react-native-track-player";
import {useSharedValue} from "react-native-reanimated";
import {MaterialCommunityIcons} from "@expo/vector-icons";
import {formatSecondsToMinutes, trackKey} from "@/helpers/miscellaneous";
import {hasNextPart, seekWithinShow, showProgress, type PartedTrack} from "@/helpers/parts";
import {runLocalAction} from "@/services/playbackReconciler";
import {notePosition} from "@/services/recovery";
import {playbackSync} from "@/services/playbackSync";
import {Slider} from "react-native-awesome-slider";
import {colors} from "@/constants";
import {progressBarStyles, utilsStyles} from "@/styles";

/**
 * How close the player has to get to a requested position before its own
 * reports are believed again. A seek is not instant — the audio element keeps
 * reporting the OLD second for a beat, and letting that through yanks the bar
 * back to where the user dragged it FROM, which reads as "the seek did
 * nothing".
 */
const SEEK_LANDED_S = 1.5

/** ...and how long to wait for it before giving up on that. */
const SEEK_TIMEOUT_MS = 4_000

/**
 * Where a tap on the bar actually lands, in seconds.
 *
 * Pure, and exported, because the arithmetic is where a seek quietly dies: with
 * a duration of `Infinity` — which a media element reports for a stream it
 * considers unfinished, and WKWebView does exactly that for VK's HLS when it
 * plays it natively — `fraction * duration` is `Infinity`, and a player handed
 * `Infinity` ignores the request. The old guard did not catch it either, since
 * `Infinity > 0` is perfectly true.
 *
 * `null` means "there is nothing sensible to seek to", which is a different
 * answer from second zero.
 */
export const seekTarget = (fraction: number, duration: number): number | null => {
  if (!Number.isFinite(duration) || duration <= 0) return null
  if (!Number.isFinite(fraction)) return null
  // Never land ON the end. The player treats reaching the last frame as "track
  // finished" and moves to the next one — which is how dragging to the
  // right-hand edge started playing something else.
  return Math.min(Math.max(fraction, 0) * duration, Math.max(duration - 1, 0))
}

export const PlayerProgressBar = ({ style }: ViewProps) => {
  const { duration: reported, position, buffered } = useProgress(250)
  const activeTrack = useActiveTrack() as PartedTrack | undefined

  // Where we are across the WHOLE show. For a single track this is just the
  // track itself with no part boundaries, so everything below works unchanged.
  const sp = showProgress(activeTrack, position)
  const multipart = sp.boundaries.length > 0

  // The player's own duration, unless it is not a number we can do arithmetic
  // with. VK tells us how long the show is and the queue carries it, so there
  // is a second source — and on the desktop it is the only one that works.
  const trackDuration = Number(activeTrack?.duration ?? 0)
  const localDuration =
    Number.isFinite(reported) && reported > 0
      ? reported
      : Number.isFinite(trackDuration) && trackDuration > 0
        ? trackDuration
        : 0

  // The bar spans the whole show when it is multipart (the sum of its parts,
  // which the API gives us outright), the single track otherwise.
  const barPosition = multipart ? sp.showPosition : position
  const duration = multipart ? sp.total : localDuration
  // the buffer, carried into show-space: everything before the active part is
  // already played, plus what the part has buffered locally
  const barBuffered = multipart ? sp.showPosition - position + buffered : buffered

  const progress = useSharedValue(0)
  const min = useSharedValue(0)
  const max = useSharedValue(1)
  const cache = useSharedValue(0)

  // Plain refs, not shared values: both are written and read on the JS thread
  // only (the slider's callbacks arrive here through runOnJS), and a shared
  // value read during render is exactly what this component used to do wrong.
  const sliding = useRef(false)
  const seek = useRef<{to: number; at: number} | null>(null)

  // The bar follows the player from an EFFECT. It used to be assigned in the
  // render body, which Reanimated does not allow and which also meant every
  // `useProgress` tick — four a second — snapped the thumb back out from under
  // the finger mid-drag.
  useEffect(() => {
    if (sliding.current) return

    if (seek.current) {
      const landed = Math.abs(position - seek.current.to) <= SEEK_LANDED_S
      const expired = Date.now() - seek.current.at > SEEK_TIMEOUT_MS
      if (!landed && !expired) return
      seek.current = null
    }

    progress.value = duration > 0 ? barPosition / duration : 0
    cache.value = duration > 0 ? barBuffered / duration : 0
  }, [barPosition, duration, barBuffered, cache, progress])

  /** Jump to the next part of the same show (drives the ▸ arrow). */
  const jumpToNextPart = useCallback(async () => {
    try {
      await runLocalAction(() => TrackPlayer.skipToNext())
    } catch (error) {
      console.warn('==player: could not jump to the next part', error)
    }
  }, [])

  const seekToFraction = useCallback(
    async (value: number) => {
      // Multipart: the bar spans the whole show, so a tap maps to a part and an
      // offset inside it. Changing part is a queue skip; the seek lands in the
      // destination part, so the landed-guard below stays in LOCAL seconds.
      if (multipart && activeTrack) {
        const dest = seekWithinShow(value, activeTrack)
        if (!dest) return
        const activeIndex = (await TrackPlayer.getActiveTrackIndex()) ?? 0
        const base = activeIndex - (activeTrack.partIndex ?? 0)
        seek.current = {to: dest.offset, at: Date.now()}
        progress.value = value
        try {
          await runLocalAction(async () => {
            if (dest.partIndex !== (activeTrack.partIndex ?? 0)) {
              await TrackPlayer.skip(base + dest.partIndex)
            }
            await TrackPlayer.seekTo(dest.offset)
          })
          const destDuration = Number(activeTrack.parts?.[dest.partIndex]?.duration) || 0
          notePosition(dest.offset, destDuration)
          playbackSync.sendProgress(
            dest.offset * 1000,
            await TrackPlayer.getPlayWhenReady(),
            trackKey((await TrackPlayer.getActiveTrack()) as never) ?? undefined,
          )
        } catch (error) {
          seek.current = null
          console.warn('==player: could not seek within the show', error)
        }
        return
      }

      // Nothing is loaded yet, or the duration is not a usable number: seeking
      // into either puts the player in a state it has to be kicked out of.
      const target = seekTarget(value, duration)
      if (target === null) {
        console.warn('==player: no usable duration to seek within', {reported, trackDuration})
        return
      }

      seek.current = {to: target, at: Date.now()}
      progress.value = target / duration
      try {
        // Inside the session's lock, like every other deliberate change (see
        // services/playbackReconciler.runLocalAction). A seek moves the needle
        // and nothing else, so the frames in flight still carry the position
        // the track was at a moment ago — and this device is usually the active
        // one, which means the reconciler believes them and seeks BACK. That
        // reads as "the bar moved and the sound did not".
        await runLocalAction(() => TrackPlayer.seekTo(target))
        // The recovery remembers where the show was, and it learns that from
        // the progress ticks — which stop coming the moment playback does. A
        // track that has just ended therefore leaves a position frozen at its
        // last tick, and the next failure restarts the track THERE, undoing
        // this seek: wherever the bar was tapped, the sound came back a minute
        // and a half from the end, again and again. A deliberate seek is the
        // one other thing that moves the needle, so it says so.
        notePosition(target, duration)
        // ...and tell the session straight away. Nothing else reports a seek:
        // play/pause is what the state listener watches, so until the next
        // five-second heartbeat the account still thought the show was where it
        // had been, and any other device following along was wrong for that long.
        playbackSync.sendProgress(
          target * 1000,
          await TrackPlayer.getPlayWhenReady(),
          trackKey((await TrackPlayer.getActiveTrack()) as never) ?? undefined,
        )
      } catch (error) {
        seek.current = null
        console.warn('==player: could not seek', error)
      }
    },
    [multipart, activeTrack, duration, reported, trackDuration, progress],
  )

  return (
    <View style={style}>
      <View>
      <Slider
        progress={progress}
        cache={cache}
        minimumValue={min}
        maximumValue={max}
        containerStyle={utilsStyles.slider}
        // Root height matched to the track it draws (the default 5 left the
        // 7pt track overhanging its own parent).
        sliderHeight={7}
        thumbWidth={0}
        renderBubble={() => null}
        // A zero-width thumb still renders a View carrying the played-track
        // colour. Nothing should be drawn there at all.
        renderThumb={() => null}
        // Three tones, and they have to READ as three. The old set had the
        // played part at 60% white and the buffer at 25% blue ON TOP of a 40%
        // white track — which composites BRIGHTER than the played part. At
        // 2:32 of a 58-minute set that painted a bright bar out to the 85% the
        // buffer had reached, and the position looked like it had run away.
        theme={{
          maximumTrackTintColor: 'rgba(255,255,255,0.22)',
          cacheTrackTintColor: 'rgba(255,255,255,0.2)',
          minimumTrackTintColor: '#ffffff',
        }}

        onSlidingStart={() => {
          sliding.current = true
        }}
        // Deliberately no `onValueChange` handler. The slider fires it on every
        // pixel of a drag, and seeking on each one sent a burst of seeks at the
        // player — which is what made playback tear and sometimes skip a track
        // outright. The thumb follows the finger on its own; only the final
        // position is a request.
        onSlidingComplete={(value) => {
          // Reached from a drag AND from a tap: the slider calls this for both,
          // but calls `onSlidingStart` only for the drag. The old guard bailed
          // out whenever `isSliding` was false, so a plain tap on the bar was
          // dropped — the "sometimes it seeks, sometimes it doesn't" half.
          sliding.current = false
          void seekToFraction(value)
        }}
      />

      {/* Where one part ends and the next begins, drawn over the bar. Only in a
          multipart show — a single track has no seam. pointerEvents none so the
          slider still owns every touch. */}
      {multipart && (
        <View style={localStyles.ticks} pointerEvents="none">
          {sp.boundaries.map((fraction, index) => (
            <View key={index} style={[localStyles.tick, {left: `${fraction * 100}%`}]}/>
          ))}
        </View>
      )}
      </View>

      <View style={progressBarStyles.timeRow}>
        <Text style={progressBarStyles.timeText}>{formatSecondsToMinutes(barPosition)}</Text>

        {/* which part is playing, and a jump to the next one */}
        {multipart && (
          <Pressable
            onPress={hasNextPart(activeTrack) ? jumpToNextPart : undefined}
            disabled={!hasNextPart(activeTrack)}
            hitSlop={10}
            style={localStyles.partLabel}
            accessibilityRole="button"
            accessibilityLabel={`Part ${sp.partIndex + 1} of ${sp.partCount}`}
          >
            <Text style={localStyles.partText}>
              Part {sp.partIndex + 1}/{sp.partCount}
            </Text>
            {hasNextPart(activeTrack) && (
              <MaterialCommunityIcons name="skip-next" size={16} color={colors.primary}/>
            )}
          </Pressable>
        )}

        <Text style={progressBarStyles.timeText}>
          {'-'} {formatSecondsToMinutes(Math.max(duration - barPosition, 0))}
        </Text>
      </View>
    </View>
  )
}

const localStyles = StyleSheet.create({
  // the same 7pt band the slider draws, so ticks sit on the track
  ticks: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 7,
  },
  tick: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 7,
    marginLeft: -1,
    backgroundColor: colors.background,
  },
  partLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  partText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
})
