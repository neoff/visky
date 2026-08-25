import React, {useEffect, useState} from 'react'
import {ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native'
import {Ionicons} from '@expo/vector-icons'
import {colors, fonts, layout} from '@/constants'
import {loadUserPlaylists, UserPlaylist} from '@/helpers/network'

/**
 * What the Favorites tab is currently showing.
 *
 * `frisky` is the default and the only one the hearts write to: a track added
 * from the listing lands in the "Frisky-favorites" playlist, which the backend
 * creates when the first track is hearted. `all` is the user's whole VK audio
 * library, and any other id is one of their own playlists — both are read-only
 * views, the heart still means "is in Frisky-favorites".
 */
export type PlaylistSelection =
  | {kind: 'frisky'}
  | {kind: 'all'}
  | {kind: 'playlist'; id: number; title: string}

export const FRISKY_SELECTION: PlaylistSelection = {kind: 'frisky'}

export const selectionLabel = (selection: PlaylistSelection): string => {
  switch (selection.kind) {
    case 'frisky':
      return 'Frisky'
    case 'all':
      return 'All'
    default:
      return selection.title
  }
}

/** the `playlist_id` query the API expects, or undefined for Frisky-favorites */
export const selectionQuery = (selection: PlaylistSelection): string | number | undefined => {
  switch (selection.kind) {
    case 'frisky':
      return undefined
    case 'all':
      return 'all'
    default:
      return selection.id
  }
}

type Props = {
  selection: PlaylistSelection
  onChange: (selection: PlaylistSelection) => void
}

export const PlaylistFilter = ({selection, onChange}: Props) => {
  const [open, setOpen] = useState(false)
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([])
  const [loading, setLoading] = useState(false)

  // the list is only needed once the sheet is opened
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    loadUserPlaylists()
      .then((items) => {
        if (!cancelled) setPlaylists(items)
      })
      .catch((error) => console.warn('Unable to load the playlists', error))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const choose = (next: PlaylistSelection) => {
    setOpen(false)
    onChange(next)
  }

  const isActive = (candidate: PlaylistSelection) =>
    candidate.kind === selection.kind &&
    (candidate.kind !== 'playlist' || selection.kind !== 'playlist' || candidate.id === selection.id)

  // Frisky-favorites and the raw library have their own rows above; showing the
  // playlist a second time under its title would be two ways to pick one thing
  const otherPlaylists = playlists.filter((playlist) => !playlist.is_frisky)

  return (
    <>
      {/* icon only: filled while a playlist is filtering the list, outline for
          "All", which is the absence of a filter */}
      <TouchableOpacity
        style={styles.button}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityLabel={`Playlist: ${selectionLabel(selection)}`}
      >
        <Ionicons
          name={selection.kind === 'all' ? 'filter-circle-outline' : 'filter-circle'}
          size={24}
          color={colors.text}
        />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* stop the press from falling through to the backdrop */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Playlist</Text>

            <Row
              title="Frisky"
              subtitle="the playlist hearts are added to"
              active={isActive({kind: 'frisky'})}
              onPress={() => choose({kind: 'frisky'})}
            />
            <Row
              title="All"
              subtitle="everything in your VK audio"
              active={isActive({kind: 'all'})}
              onPress={() => choose({kind: 'all'})}
            />

            <View style={styles.divider}/>

            {loading && <ActivityIndicator color={colors.icon} style={{marginVertical: 12}}/>}

            <ScrollView style={{maxHeight: 320}}>
              {otherPlaylists.map((playlist) => (
                <Row
                  key={playlist.id}
                  title={playlist.title}
                  subtitle={`${playlist.count} tracks`}
                  active={isActive({kind: 'playlist', id: playlist.id, title: playlist.title})}
                  onPress={() => choose({kind: 'playlist', id: playlist.id, title: playlist.title})}
                />
              ))}
              {!loading && otherPlaylists.length === 0 && (
                <Text style={styles.empty}>No other playlists</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const Row = ({
               title,
               subtitle,
               active,
               onPress,
             }: {
  title: string
  subtitle?: string
  active: boolean
  onPress: () => void
}) => (
  <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
    <View style={{flex: 1, minWidth: 0}}>
      <Text style={[styles.rowTitle, active && {color: colors.primary}]} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
    </View>
    {active && <Ionicons name="checkmark" size={18} color={colors.primary}/>}
  </TouchableOpacity>
)

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    height: layout.searchBoxHeight,
    width: layout.searchBoxHeight,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    // OPAQUE on purpose: the shared `colors.surface` plate is translucent, and
    // the track list behind it read straight through the sheet
    backgroundColor: '#1c1c1c',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  sheetTitle: {
    color: colors.textMuted,
    fontSize: fonts.xs,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowTitle: {
    color: colors.text,
    fontSize: fonts.base,
  },
  rowSubtitle: {
    color: colors.textMuted,
    fontSize: fonts.xs,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceDivider,
    marginVertical: 8,
  },
  empty: {
    color: colors.textMuted,
    fontSize: fonts.sm,
    paddingVertical: 12,
  },
})
