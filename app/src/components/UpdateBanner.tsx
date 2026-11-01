import React from 'react'
import {Pressable, StyleSheet, Text, View, ViewProps} from 'react-native'
import {Ionicons} from '@expo/vector-icons'
import {colors, fonts} from '@/constants'
import {
  currentVersion,
  openStore,
  updateAction,
  updateHeadline,
  useAvailableUpdate,
  useUpdateStore,
} from '@/store/update'

/**
 * "There is a newer one, and you are not on it."
 *
 * Docked above the mini player in the same translucent plate the player and the
 * tab bar use, so it reads as part of the furniture rather than a dialog. It
 * never interrupts: nothing is blocked, playback is untouched, and ✕ puts it
 * away until there is a release newer still.
 *
 * WHERE TO GET IT is per platform and deliberately short — the app cannot
 * install anything itself (see store/update), so the one useful sentence is
 * which door to knock on, and the plate itself opens that door.
 */

export const UpdateBanner = ({style}: ViewProps) => {
  const available = useAvailableUpdate()
  const dismiss = useUpdateStore((state) => state.dismiss)

  if (!available) return null

  return (
    <Pressable
      onPress={() => void openStore()}
      accessibilityRole="button"
      accessibilityLabel={updateHeadline(available)}
      style={({pressed}) => [styles.plate, pressed && styles.pressed, style]}
    >
      <Ionicons name="arrow-up-circle" size={18} color={colors.primary}/>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {updateHeadline(available)}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {updateAction} — you are on {currentVersion}
        </Text>
      </View>
      {/* Its own target, inside the plate: tapping the notice should open the
          store, and the one place that must NOT is the ✕. */}
      <Pressable onPress={dismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Ionicons name="close" size={18} color={colors.textMuted}/>
      </Pressable>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.85,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: fonts.sm,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fonts.xs,
  },
})
