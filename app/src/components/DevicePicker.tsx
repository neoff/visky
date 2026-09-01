import {MaterialCommunityIcons} from '@expo/vector-icons'
import {ActivityIndicator, Modal, Pressable, StyleSheet, Text, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {colors, fonts, screenPadding} from '@/constants'
import {transferPlayback} from '@/helpers/network'
import {useAudioRoute} from '@/hooks/useAudioRoute'
import {playbackSync} from '@/services/playbackSync'
import {usePlaybackStore} from '@/store/playback'
import {PlaybackDeviceInfo} from '@/types/playback'
import {AudioRoute, AudioRouteKind} from '../../modules/audio-route'

/**
 * Two questions, stacked in one sheet, and they are easy to confuse:
 *
 *   "Sound output"  — WHERE ON THIS DEVICE the sound leaves: its speaker, the
 *                     headphones, a Bluetooth set. The OS owns it.
 *   "Play on"       — WHICH DEVICE signed into the account is playing at all.
 *                     We own it, over the socket.
 *
 * Output comes first because it is the one that changes daily.
 *
 * "Play on…" is the same idea as Spotify Connect's speaker list. A device is
 * only a target while it is reachable: the app in the foreground, or in the
 * background WITH sound (both platforms keep the process alive then). A device
 * that has been swiped away is greyed out, because nothing can start audio on
 * it from the outside — a silent push can wake an app, but never make it play.
 * Its last position is not lost though: it restores the moment the user opens
 * the app there.
 */

const OUTPUT_ICONS: Record<AudioRouteKind, keyof typeof MaterialCommunityIcons.glyphMap> = {
  bluetooth: 'bluetooth-audio',
  headphones: 'headphones',
  speaker: 'volume-high',
  usb: 'usb',
  hdmi: 'video-input-hdmi',
  car: 'car',
  airplay: 'cast-audio',
  unknown: 'volume-high',
}

const OUTPUT_LABELS: Record<AudioRouteKind, string> = {
  bluetooth: 'Bluetooth',
  headphones: 'Headphones',
  speaker: 'Speaker',
  usb: 'USB',
  hdmi: 'HDMI',
  car: 'Car',
  airplay: 'AirPlay',
  unknown: 'Audio output',
}

/** Shared with the Devices screen, which lists the same rows without the transfer. */
export const iconFor = (platform: string | null): keyof typeof MaterialCommunityIcons.glyphMap => {
  if (platform === 'ios') return 'cellphone'
  if (platform === 'android') return 'cellphone-basic'
  if (platform === 'web') return 'laptop'
  return 'devices'
}

export const lastSeenLabel = (device: PlaybackDeviceInfo): string => {
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
  const output = useAudioRoute()

  const outputKind = output.current?.kind ?? 'unknown'
  // Everything connected minus the one in use — "2 others connected" is the
  // only honest way to hint at a choice we cannot make from here.
  const otherOutputs = output.available.filter((route) => route.id !== output.current?.id).length

  // The OS owns this one. Neither platform lets an app move media to a chosen
  // output — see modules/audio-route — so the row opens the system picker
  // instead of pretending to switch.
  const handleOutput = () => {
    void AudioRoute.presentOutputPicker()
  }

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

        {output.canPresentPicker && (
          <>
            <Text style={styles.title}>Sound output</Text>
            <Pressable
              onPress={handleOutput}
              style={({pressed}) => [styles.row, pressed && styles.rowPressed]}
            >
              <MaterialCommunityIcons name={OUTPUT_ICONS[outputKind]} size={24} color={colors.icon} />
              <View style={styles.rowText}>
                <Text style={styles.deviceName} numberOfLines={1}>
                  {output.current?.name ?? 'This device'}
                </Text>
                <Text style={styles.deviceMeta} numberOfLines={1}>
                  {OUTPUT_LABELS[outputKind]}
                  {otherOutputs > 0
                    ? ` · ${otherOutputs} other${otherOutputs > 1 ? 's' : ''} connected`
                    : ''}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
            </Pressable>
            <View style={styles.separator} />
          </>
        )}

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
  // Splits the OS-owned half of the sheet from the account-owned half. Same
  // colour as the mini player's seam, so the two reads as one language.
  separator: {
    height: 1,
    backgroundColor: colors.surfaceDivider,
    marginTop: 10,
    marginBottom: 16,
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
