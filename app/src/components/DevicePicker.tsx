import {MaterialCommunityIcons} from '@expo/vector-icons'
import {ActivityIndicator, Modal, Pressable, StyleSheet, Text, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {colors, fonts, screenPadding} from '@/constants'
import {transferPlayback} from '@/helpers/network'
import {playbackSync} from '@/services/playbackSync'
import {usePlaybackStore} from '@/store/playback'
import {PlaybackDeviceInfo} from '@/types/playback'

/**
 * "Play on…" — the same idea as Spotify Connect's speaker list.
 *
 * A device is only a target while it is reachable: the app in the foreground,
 * or in the background WITH sound (both platforms keep the process alive then).
 * A device that has been swiped away is greyed out, because nothing can start
 * audio on it from the outside — a silent push can wake an app, but never make
 * it play. Its last position is not lost though: it restores the moment the
 * user opens the app there.
 */

const iconFor = (platform: string | null): keyof typeof MaterialCommunityIcons.glyphMap => {
  if (platform === 'ios') return 'cellphone'
  if (platform === 'android') return 'cellphone-basic'
  if (platform === 'web') return 'laptop'
  return 'devices'
}

const lastSeenLabel = (device: PlaybackDeviceInfo): string => {
  if (device.online) return device.is_active ? 'Playing here' : 'Available'
  if (!device.last_seen_ms) return 'Offline'
  const minutes = Math.round((Date.now() - device.last_seen_ms) / 60_000)
  if (minutes < 60) return `Last seen ${minutes || 1} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `Last seen ${hours}h ago`
  return `Last seen ${Math.round(hours / 24)}d ago`
}

export const DevicePicker = ({visible, onClose}: {visible: boolean; onClose: () => void}) => {
  const {bottom} = useSafeAreaInsets()
  const devices = usePlaybackStore((store) => store.devices)
  const thisDevice = usePlaybackStore((store) => store.deviceId)
  const connected = usePlaybackStore((store) => store.connected)

  const handlePick = async (device: PlaybackDeviceInfo) => {
    if (device.is_active) {
      onClose()
      return
    }
    // The socket is the fast path; REST is what still works when it is down
    // (and the backend rings the target's wake-up push either way).
    if (playbackSync.isConnected) {
      playbackSync.transferTo(device.device_id)
    } else {
      try {
        await transferPlayback(device.device_id)
      } catch (error) {
        console.warn('==playback: transfer failed', error)
      }
    }
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, {paddingBottom: bottom + 16}]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Play on</Text>

        {devices.length === 0 ? (
          <View style={styles.empty}>
            {connected ? (
              <Text style={styles.emptyText}>No other devices signed in</Text>
            ) : (
              <>
                <ActivityIndicator color={colors.icon} />
                <Text style={styles.emptyText}>Connecting…</Text>
              </>
            )}
          </View>
        ) : (
          devices.map((device) => {
            const disabled = !device.online && !device.can_wake
            return (
              <Pressable
                key={device.device_id}
                onPress={() => handlePick(device)}
                disabled={disabled}
                style={({pressed}) => [styles.row, pressed && !disabled && styles.rowPressed]}
              >
                <MaterialCommunityIcons
                  name={iconFor(device.platform)}
                  size={24}
                  color={device.is_active ? colors.primary : device.online ? colors.icon : colors.textMutedDarker}
                />
                <View style={styles.rowText}>
                  <Text
                    style={[
                      styles.deviceName,
                      device.is_active && {color: colors.primary},
                      !device.online && {color: colors.textMuted},
                    ]}
                    numberOfLines={1}
                  >
                    {device.name ?? 'Unknown device'}
                    {device.device_id === thisDevice ? ' (this device)' : ''}
                  </Text>
                  <Text style={styles.deviceMeta} numberOfLines={1}>
                    {lastSeenLabel(device)}
                    {!device.online && device.can_wake ? ' · will be woken' : ''}
                  </Text>
                </View>
                {device.is_active && <MaterialCommunityIcons name="cast-connected" size={22} color={colors.primary} />}
              </Pressable>
            )
          })
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: screenPadding.horizontal + 8,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceDivider,
    marginBottom: 14,
  },
  title: {
    color: colors.text,
    fontSize: fonts.base,
    fontWeight: '700',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 14,
    paddingVertical: 12,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowText: {
    flex: 1,
  },
  deviceName: {
    color: colors.text,
    fontSize: fonts.sm,
    fontWeight: '600',
  },
  deviceMeta: {
    color: colors.textMuted,
    fontSize: fonts.xs,
    marginTop: 2,
  },
  empty: {
    alignItems: 'center',
    rowGap: 8,
    paddingVertical: 24,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fonts.sm,
  },
})
