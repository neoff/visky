import React, {useState} from 'react'
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native'
import {colors, fonts} from '@/constants'

/**
 * `@react-native-menu/menu` for the web build.
 *
 * The native package renders a UIMenu / Android PopupMenu, neither of which
 * exists in a browser. This draws the same thing as a centred sheet: the point
 * of the component is "press this row, pick one of these actions", and that
 * survives the change of presentation.
 *
 * `image` on an action names an SF Symbol. There is no web equivalent and
 * inventing an icon mapping would be guesswork, so the label carries the
 * meaning on its own here.
 */

export type MenuAction = {
  id: string
  title: string
  image?: string
  attributes?: {destructive?: boolean; disabled?: boolean}
}

type MenuViewProps = {
  actions: MenuAction[]
  onPressAction: (event: {nativeEvent: {event: string}}) => void
  title?: string
  children?: React.ReactNode
  shouldOpenOnLongPress?: boolean
}

export const MenuView = ({actions, onPressAction, title, children}: MenuViewProps) => {
  const [open, setOpen] = useState(false)

  const choose = (id: string) => {
    setOpen(false)
    onPressAction({nativeEvent: {event: id}})
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)}>{children}</Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* The backdrop is the dismiss target, the way tapping outside a
            UIMenu closes it. */}
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {actions.map((action) => (
              <Pressable
                key={action.id}
                disabled={action.attributes?.disabled}
                style={styles.row}
                onPress={() => choose(action.id)}
              >
                <Text
                  style={[
                    styles.label,
                    action.attributes?.destructive && styles.destructive,
                    action.attributes?.disabled && styles.disabled,
                  ]}
                >
                  {action.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    minWidth: 260,
    borderRadius: 12,
    paddingVertical: 6,
    backgroundColor: '#1c1c1e',
  },
  title: {
    color: colors.textMuted,
    fontSize: fonts.xs,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  row: {paddingHorizontal: 16, paddingVertical: 12},
  label: {color: colors.text, fontSize: fonts.sm},
  destructive: {color: '#ff453a'},
  disabled: {opacity: 0.4},
})

export default {MenuView}
