import React, {useCallback, useRef, useState} from 'react'
import {ActivityIndicator, Platform, Pressable, StyleSheet, Text, View} from 'react-native'
import {MaterialCommunityIcons} from '@expo/vector-icons'
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable'
import {iconFor, lastSeenLabel} from '@/components/DevicePicker'
import {colors, fonts} from '@/constants'
import {PlaybackDeviceInfo} from '@/types/playback'

/**
 * One row of the "Signed in" list, and how to sign it out.
 *
 * Swipe left, then confirm. Two steps because the button is destructive and
 * cannot be undone from here: the device it removes is usually not running, so
 * it cannot be told "never mind" — the next time it is opened it will have been
 * signed out, and whoever holds it will have to type a VK password again.
 *
 * The confirmation is a second state of the row rather than an `Alert`. React
 * Native's `Alert` does nothing at all on web, and the desktop build lists the
 * same devices on the same screen; one implementation that behaves identically
 * everywhere beats a native dialog on two platforms out of three.
 *
 * THIS device has no swipe. Signing yourself out is the button in Settings that
 * already says Sign out — it clears the session locally, which this route
 * deliberately cannot do (the API answers 400 `self_revoke`).
 */

const ACTION_WIDTH = 96

export const DeviceRow = ({
  device,
  isThisDevice,
  onRemove,
}: {
  device: PlaybackDeviceInfo
  isThisDevice: boolean
  onRemove: (deviceId: string) => Promise<void>
}) => {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const swipeable = useRef<SwipeableMethods>(null)

  const ask = useCallback(() => {
    swipeable.current?.close()
    setConfirming(true)
  }, [])

  const cancel = useCallback(() => setConfirming(false), [])

  const confirm = useCallback(async () => {
    setBusy(true)
    try {
      await onRemove(device.device_id)
      // No setConfirming(false): a successful removal takes this row out of the
      // list, and touching state on the way out is a warning for nothing.
    } catch {
      setBusy(false)
      setConfirming(false)
    }
  }, [device.device_id, onRemove])

  if (confirming) {
    return (
      <View style={[styles.row, styles.confirmRow]}>
        <Text style={styles.confirmText} numberOfLines={2}>
          Sign {device.name || 'this device'} out?
        </Text>
        {busy ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <View style={styles.confirmButtons}>
            <Pressable onPress={cancel} hitSlop={8}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Pressable onPress={confirm} hitSlop={8}>
              <Text style={styles.destructive}>Sign out</Text>
            </Pressable>
          </View>
        )}
      </View>
    )
  }

  const body = (
    <View style={styles.row}>
      <MaterialCommunityIcons
        name={iconFor(device.platform)}
        size={22}
        color={device.online ? colors.icon : colors.textMutedDarker}
      />
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {device.name || 'Unnamed device'}
          {isThisDevice ? ' · this one' : ''}
        </Text>
        <Text style={styles.state}>{lastSeenLabel(device)}</Text>
      </View>

      {/* A pointer has no swipe worth discovering. The desktop build shows the
          action outright; the phones keep the gesture, which is what the rest of
          this app teaches. */}
      {!isThisDevice && Platform.OS === 'web' ? (
        <Pressable onPress={ask} hitSlop={8}>
          <MaterialCommunityIcons name="close-circle-outline" size={20} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  )

  if (isThisDevice || Platform.OS === 'web') return body

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable style={styles.action} onPress={ask}>
          <MaterialCommunityIcons name="logout-variant" size={20} color={colors.text} />
          <Text style={styles.actionText}>Sign out</Text>
        </Pressable>
      )}
    >
      {body}
    </ReanimatedSwipeable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceDivider,
    // Opaque: it slides over the action underneath it, and a translucent row
    // would show the red through itself the whole way.
    backgroundColor: colors.surface,
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
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    rowGap: 4,
    backgroundColor: '#8E2A2A',
  },
  actionText: {
    color: colors.text,
    fontSize: fonts.xs,
    fontWeight: '600',
  },
  confirmRow: {
    columnGap: 10,
  },
  confirmText: {
    flex: 1,
    color: colors.text,
    fontSize: fonts.xs,
  },
  confirmButtons: {
    flexDirection: 'row',
    columnGap: 16,
    alignItems: 'center',
  },
  cancel: {
    color: colors.textMuted,
    fontSize: fonts.xs,
    fontWeight: '600',
  },
  destructive: {
    color: '#FF6B6B',
    fontSize: fonts.xs,
    fontWeight: '700',
  },
})
