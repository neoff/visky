import React, {useCallback, useState} from 'react'
import {ScrollView, StyleSheet, Text, View} from 'react-native'
import {AuthHandoff} from '@/components/AuthHandoff'
import {DeviceRow} from '@/components/DeviceRow'
import {colors, fonts, layout, screenPadding} from '@/constants'
import {removeDevice} from '@/helpers/network'
import {usePlaybackStore} from '@/store/playback'

/**
 * Everything signed into this account, and how to add one more.
 *
 * The list is the same one "Play on" offers — every app holding a socket for
 * this VK user — but it answers a different question: "what is signed in as
 * me?", not "where should the sound come out?". An app that has been swiped away
 * keeps its row, which is the point: it is still signed in, and this is where
 * you would notice one you do not recognise — and now sign it out.
 */
const DevicesScreen = () => {
  const devices = usePlaybackStore((store) => store.devices)
  const thisDevice = usePlaybackStore((store) => store.deviceId)
  const connected = usePlaybackStore((store) => store.connected)
  const [error, setError] = useState<string | null>(null)

  /**
   * The answer carries the new roster, so the list is replaced rather than
   * patched: the server has just decided what is signed in, and it is the only
   * thing that knows. The sockets of every other device get the same list
   * pushed to them, so this screen open on the desktop updates by itself.
   */
  const remove = useCallback(async (deviceId: string) => {
    setError(null)
    try {
      const {devices: left} = await removeDevice(deviceId)
      usePlaybackStore.getState().setDevices(left)
    } catch (failure) {
      console.warn('==devices: could not sign that device out', failure)
      setError('Could not sign that device out. Try again in a moment.')
      throw failure
    }
  }, [])

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
              <DeviceRow
                key={device.device_id}
                device={device}
                isThisDevice={device.device_id === thisDevice}
                onRemove={remove}
              />
            ))}
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.heading}>Add a device</Text>
        <AuthHandoff />

        <Text style={styles.footnote}>
          Swipe a device to sign it out. It loses access straight away, and an app that was closed
          at the time is signed out the moment it is next opened. This one can only be signed out
          with the Sign out button.
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
    // Clear the tab bar AND the floating player that sits on top of it.
    // A flat 48 put the "Add a device" buttons underneath the miniplayer,
    // where a tap reaches the player instead. Same figure the song and
    // favourites lists use.
    paddingBottom: layout.tabBarContentHeight + 80,
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
  empty: {
    color: colors.textMuted,
    fontSize: fonts.xs,
  },
  error: {
    color: '#FF6B6B',
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
