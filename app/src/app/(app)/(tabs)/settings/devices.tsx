import React from 'react'
import {ScrollView, StyleSheet, Text, View} from 'react-native'
import {MaterialCommunityIcons} from '@expo/vector-icons'
import {AuthHandoff} from '@/components/AuthHandoff'
import {iconFor, lastSeenLabel} from '@/components/DevicePicker'
import {colors, fonts, screenPadding} from '@/constants'
import {usePlaybackStore} from '@/store/playback'

/**
 * Everything signed into this account, and how to add one more.
 *
 * The list is the same one "Play on" offers — every app holding a socket for
 * this VK user — but read-only here: this screen answers "what is signed in as
 * me?", not "where should the sound come out?". A device that has been swiped
 * away keeps its row until the token expires, which is the point: it is still
 * signed in, and this is where you would notice one you do not recognise.
 */
const DevicesScreen = () => {
  const devices = usePlaybackStore((store) => store.devices)
  const thisDevice = usePlaybackStore((store) => store.deviceId)
  const connected = usePlaybackStore((store) => store.connected)

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Signed in</Text>

        {devices.length === 0 ? (
          <Text style={styles.empty}>
            {connected
              ? 'Only this device so far.'
              : 'Not connected — the list arrives with the playback socket.'}
          </Text>
        ) : (
          <View style={styles.list}>
            {devices.map((device) => (
              <View key={device.device_id} style={styles.row}>
                <MaterialCommunityIcons
                  name={iconFor(device.platform)}
                  size={22}
                  color={device.online ? colors.icon : colors.textMutedDarker}
                />
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {device.name || 'Unnamed device'}
                    {device.device_id === thisDevice ? ' · this one' : ''}
                  </Text>
                  <Text style={styles.state}>{lastSeenLabel(device)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.heading}>Add a device</Text>
        <AuthHandoff />

        <Text style={styles.footnote}>
          Signing out here does not sign the others out — each one holds its own copy of the VK
          token until it expires.
        </Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: screenPadding.horizontal,
    paddingBottom: 48,
    rowGap: 14,
  },
  heading: {
    color: colors.text,
    fontSize: fonts.sm,
    fontWeight: '600',
    marginTop: 10,
  },
  list: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceDivider,
  },
  rowText: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontSize: fonts.sm,
    fontWeight: '600',
  },
  state: {
    color: colors.textMuted,
    fontSize: fonts.xs,
    marginTop: 2,
  },
  empty: {
    color: colors.textMuted,
    fontSize: fonts.xs,
  },
  footnote: {
    color: colors.textMutedDarker,
    fontSize: fonts.xs,
    lineHeight: fonts.xs + 5,
    marginTop: 10,
  },
})

export default DevicesScreen
