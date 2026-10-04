import {unknownTrackImageUri} from "@/constants/images"
import {colors, fonts} from "@/constants"
import {trackListStyles} from "@/styles"
import {ActivityIndicator, Platform, Pressable, StyleSheet, Text, TouchableHighlight, View} from "react-native"
import FastImage from "react-native-fast-image"
import {Track, useActiveTrack, useIsPlaying} from "react-native-track-player";
import ReanimatedSwipeable, {type SwipeableMethods} from "react-native-gesture-handler/ReanimatedSwipeable";
import {Entypo, FontAwesome, Ionicons} from "@expo/vector-icons";
import dayjs from "dayjs";
import {useCallback, useRef, useState} from "react";
import {isSameTrack} from "@/helpers/miscellaneous";
import {useIsFavorite, useToggleFavorite} from "@/store/favorites";
import {useIsPlayed} from "@/store/played";

export type TracksListItemProps = {
  track: Track
  onTrackSelect: (track: Track) => void
  /**
   * Draw the lit heart. Off for a list that IS the favourites: every row there
   * is one, so a heart on each of them says nothing and reads as a column of
   * decoration. The swipes still work — swipe left is how a row leaves.
   */
  showFavorite?: boolean
}

/** how far the row slides before the action underneath it is armed */
const ACTION_WIDTH = 96

/** rAF where there is one (a device, a browser), a macrotask where there is not */
const nextFrame = (run: () => void) =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : setTimeout(run, 0)

/**
 * One row of a track list, and the two things that can be done to it without
 * opening anything: swipe RIGHT to add it to the favourites, swipe LEFT to take
 * it out again — the same gesture the Signed-in list uses to sign a device out
 * (see DeviceRow), mirrored so the two directions mean opposite things.
 *
 * The heart is INFORMATIVE: it is lit for a track that is already a favourite
 * and absent otherwise. It used to be the only way to add one, which meant
 * every row carried an empty outline that looked like a control and read like
 * noise in a list of a thousand tracks.
 *
 * A pointer has no swipe worth discovering, so on the desktop the heart comes
 * back as a control when the row is hovered — the same trade DeviceRow makes.
 */
export const TrackListItem = ({
                                track,
                                onTrackSelect: handleTrackSelect,
                                showFavorite = true,
                              }: TracksListItemProps) => {
  const {playing, bufferingDuringPlay} = useIsPlaying()
  // by id, not by url — VK's signed urls change on every refresh
  const isActiveTrack = isSameTrack(useActiveTrack(), track)
  const isFavorite = useIsFavorite(track)
  const toggleFavorite = useToggleFavorite()
  // a show runs an hour and the list is an archive, so "already heard" is worth
  // seeing at a glance
  const isPlayed = useIsPlayed(track)

  const swipeable = useRef<SwipeableMethods>(null)
  const [hovered, setHovered] = useState(false)

  /**
   * The SWIPE is the action, not a drawer with a button in it.
   *
   * The first version revealed a pressable panel and waited for a tap on it.
   * On a phone that is a second deliberate act for something the gesture
   * already said, and on the desktop — where the drag is a trackpad push — the
   * row simply stayed open: nothing was added, and it did not come back.
   *
   * So the panel is scenery, `onSwipeableWillOpen` commits, and the row closes
   * itself on the way.
   */
  const flipFavorite = useCallback(() => {
    void toggleFavorite(track)
    // Closed on the NEXT frame, not in this one: the open animation has just
    // been started by the gesture, and closing inside the same tick asks the
    // spring to do two things at once — which is how the row got stuck
    // half-open with nothing added.
    nextFrame(() => swipeable.current?.close())
  }, [toggleFavorite, track])

  const body = (
    // The pointer events are the desktop's hover; on a touch screen nothing
    // ever fires them, which is why the heart there is swipe-only.
    <View
      onPointerEnter={Platform.OS === 'web' ? () => setHovered(true) : undefined}
      onPointerLeave={Platform.OS === 'web' ? () => setHovered(false) : undefined}
    >
    <TouchableHighlight onPress={() => handleTrackSelect(track)}>
      <View style={[trackListStyles.trackItemContainer, styles.row]}>
        <View style={trackListStyles.trackArtworkContainer}>
          <FastImage
            source={{
              uri: track.artwork ?? unknownTrackImageUri,
              priority: FastImage.priority.normal,
            }}
            style={{
              ...trackListStyles.trackArtworkImage,
              opacity: !track.url ? 0.4 : isActiveTrack ? 0.6 : 1,
            }}
          />

          {isActiveTrack && (
            <View style={trackListStyles.trackArtworkOverlay} pointerEvents="none">
              {/* the spinner means BUFFERING, not "playing": a playing track
                  shows the pause glyph, a paused one shows play */}
              {bufferingDuringPlay ? (
                <ActivityIndicator color={colors.icon} size="small"/>
              ) : (
                <Ionicons name={playing ? 'pause' : 'play'} size={24} color={colors.icon}/>
              )}
            </View>
          )}
        </View>

        <View style={{
          flex: 1,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          {/* Track title + artist */}
          <View style={{flex: 1, minWidth: 0}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
              {isPlayed && !isActiveTrack && (
                <Ionicons name="checkmark-circle" size={14} color={colors.textMutedDarker}/>
              )}
              <Text numberOfLines={1} style={{
                ...trackListStyles.trackTitleText,
                color: !track.url
                  ? colors.textMuted
                  : isActiveTrack
                    ? colors.primary
                    : isPlayed ? colors.textMuted : colors.text,
                textDecorationLine: !track.url ? 'line-through' : 'none',
                flexShrink: 1,
              }}>
                {track.title}
              </Text>
            </View>

            <View style={{
              flex: 1,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              {track.artist && (
                <Text numberOfLines={1} style={{
                  ...trackListStyles.trackArtistText,
                  color: !track.url ? colors.textMutedDarker : colors.textMuted,
                }}>
                  {track.artist}
                </Text>
              )}
              <View style={{alignItems: 'flex-end'}}>
                <Text numberOfLines={1} style={{
                  ...trackListStyles.trackArtistText,
                  color: !track.url ? colors.textMutedDarker : colors.textMuted,
                }}>
                  {dayjs.unix(Number(track.date)).format('DD.MM.YYYY')}
                </Text>
              </View>
            </View>
          </View>

          {/* Lit = this track is in the favourites. A hovered desktop row also
              shows the outline, and there it IS a button: the pointer has no
              swipe. */}
          {showFavorite && (isFavorite || (Platform.OS === 'web' && hovered)) ? (
            <Pressable
              onPress={Platform.OS === 'web' ? flipFavorite : undefined}
              disabled={Platform.OS !== 'web'}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
              style={styles.heart}
              // on the phones it says something, it does not do something
              accessibilityRole={Platform.OS === 'web' ? 'button' : 'image'}
              accessibilityLabel={isFavorite ? 'In your favorites' : 'Add to favorites'}
            >
              <FontAwesome
                name={isFavorite ? 'heart' : 'heart-o'}
                size={16}
                color={isFavorite ? colors.primary : colors.icon}
              />
            </Pressable>
          ) : showFavorite ? (
            // Only where a heart CAN appear: the row must not reflow when it
            // does. A list that never draws one keeps the width instead.
            <View style={[styles.heart, styles.heartPlaceholder]}/>
          ) : null}

          <Entypo name="dots-three-horizontal" size={18} color={colors.icon}/>
        </View>
      </View>
    </TouchableHighlight>
    </View>
  )

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={2}
      leftThreshold={ACTION_WIDTH / 2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootLeft={false}
      overshootRight={false}
      // Released past the threshold: take the action and close. Both directions
      // land here, and only the direction that HAS a panel can open at all.
      onSwipeableWillOpen={flipFavorite}
      // swipe RIGHT — only for a track that is not one yet
      renderLeftActions={isFavorite ? undefined : () => (
        <View style={[styles.action, styles.addAction]}>
          <FontAwesome name="heart" size={18} color={colors.text}/>
          <Text style={styles.actionText}>Favorite</Text>
        </View>
      )}
      // swipe LEFT — and only out of the list it is in
      renderRightActions={isFavorite ? () => (
        <View style={[styles.action, styles.removeAction]}>
          <FontAwesome name="heart-o" size={18} color={colors.text}/>
          <Text style={styles.actionText}>Remove</Text>
        </View>
      ) : undefined}
    >
      {body}
    </ReanimatedSwipeable>
  )
}

const styles = StyleSheet.create({
  // Opaque: the row slides over the action underneath it, and a translucent one
  // would show the colour through itself the whole way.
  row: {
    backgroundColor: colors.background,
  },
  heart: {
    paddingHorizontal: 10,
  },
  heartPlaceholder: {
    width: 16 + 20,
  },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    rowGap: 4,
  },
  addAction: {
    backgroundColor: '#2A5B8E',
  },
  removeAction: {
    backgroundColor: '#8E2A2A',
  },
  actionText: {
    color: colors.text,
    fontSize: fonts.xs,
    fontWeight: '600',
  },
})
