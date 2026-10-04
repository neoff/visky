import {colors, fonts} from "@/constants"
import {defaultStyles} from "@/styles"
import {Artist} from "@/helpers/network"
import {Ionicons} from "@expo/vector-icons"
import {StyleSheet, Text, TouchableHighlight, View} from "react-native"
import FastImage from "react-native-fast-image"

export type ArtistListItemProps = {
  artist: Artist
  onSelect: (artist: Artist) => void
}

/**
 * One DJ in the directory.
 *
 * A round photo rather than the square artwork a track row uses: this is a
 * person, not a cover, and the shape is what tells the two lists apart at a
 * glance. frisky.fm has no photo for some of its older artists — those get the
 * same circle with a silhouette in it, never a broken image and never the
 * show's cover, which would be a picture of something else entirely.
 */
export const ArtistListItem = ({artist, onSelect}: ArtistListItemProps) => {
  // "House, Techno" reads better than a stack of chips in a 50pt row, and the
  // home city is worth more than a third genre nobody scans
  const subtitle = [artist.genres.slice(0, 2).join(', '), artist.homeCity]
    .filter(Boolean)
    .join(' · ')

  return (
    <TouchableHighlight onPress={() => onSelect(artist)}>
      <View style={styles.container}>
        <View style={styles.photoContainer}>
          {artist.photo ? (
            <FastImage
              source={{uri: artist.photo, priority: FastImage.priority.normal}}
              style={styles.photo}
            />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Ionicons name="person" size={24} color={colors.textMutedDarker}/>
            </View>
          )}
        </View>

        <View style={styles.text}>
          <Text numberOfLines={1} style={styles.name}>{artist.name}</Text>
          {subtitle.length > 0 && (
            <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
          )}
        </View>

        <View style={styles.trailing}>
          <Text style={styles.count}>{artist.shows}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMutedDarker}/>
        </View>
      </View>
    </TouchableHighlight>
  )
}

const PHOTO_SIZE = 50

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 14,
    paddingVertical: 8,
  },
  photoContainer: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: PHOTO_SIZE / 2,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...defaultStyles.text,
    fontSize: fonts.sm,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fonts.xs,
    marginTop: 2,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
  },
  count: {
    color: colors.textMutedDarker,
    fontSize: fonts.xs,
  },
})
