import React, {useMemo, useState} from 'react'
import {Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native'
import {MaterialCommunityIcons} from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {AuthQrCode} from '@/components/AuthQrCode'
import {PairSender} from '@/components/PairSender'
import {useSession} from '@/components/SessionProvider'
import {colors, fonts, screenPadding, webPlayerUrl} from '@/constants'
import {buildAuthPayload} from '@/helpers/authTransfer'

/**
 * The signed-in half of the handover, on the Devices screen.
 *
 * The whole reason this exists: the web player cannot log in. VK's audio token
 * only comes out of a legacy password grant, and that grant is challenged from
 * anything that does not look like a phone. So the phone stays the only thing
 * that can sign in, and every other screen is handed the result.
 *
 * Two directions, both kept, because they fail in different places:
 *
 *  ADD A DEVICE — the other screen shows a code, this phone reads it and posts
 *    the session to the API, which holds it for three minutes. This is the way
 *    round that works in practice: a laptop's camera is the worst one in the
 *    room and half of them do not have one, while the phone that must do the
 *    login anyway always does.
 *
 *  SHOW MY CODE — this phone draws its own credentials into a QR for the other
 *    screen's camera. Nothing goes through the server, which makes it the thing
 *    to reach for when the server is the problem.
 */
export const AuthHandoff = () => {
  const {getSession} = useSession()
  const {bottom} = useSafeAreaInsets()

  const [showing, setShowing] = useState<'none' | 'send' | 'qr'>('none')
  const [copied, setCopied] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const session = getSession()
  const payload = useMemo(() => buildAuthPayload(session), [session])

  const copy = async () => {
    if (!payload) return
    try {
      await Clipboard.setStringAsync(payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (error) {
      console.warn('==handoff: could not copy', error)
      setProblem('Could not reach the clipboard.')
    }
  }

  if (!payload) return null

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Action icon="qrcode-scan" label="Add a device" onPress={() => setShowing('send')} />
        <Action icon="qrcode" label="Show my code" onPress={() => setShowing('qr')} />
        <Action
          icon={copied ? 'check' : 'content-copy'}
          label={copied ? 'Copied' : 'Copy link'}
          onPress={copy}
        />
      </View>

      <Text style={styles.note}>
        Open {webPlayerUrl} on the other screen and read the code it shows — or let it read this
        one. Either way it signs in with this account until the VK token expires.
      </Text>

      {problem && <Text style={styles.problem}>{problem}</Text>}

      <Modal
        visible={showing !== 'none'}
        transparent
        animationType="slide"
        onRequestClose={() => setShowing('none')}
      >
        <Pressable style={styles.backdrop} onPress={() => setShowing('none')} />
        <View style={[styles.sheet, {paddingBottom: bottom + 20}]}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            {showing === 'send' ? (
              <>
                <Text style={styles.sheetTitle}>Read the code on the other screen</Text>
                <PairSender onDone={() => setShowing('none')} />
              </>
            ) : (
              <>
                <Text style={styles.sheetTitle}>Let another device read this</Text>
                <AuthQrCode value={payload} />
                <Text style={styles.sheetNote}>
                  This code IS the account, not a one-time key. Point a camera at it only from a
                  device you own.
                </Text>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const Action = ({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  label: string
  onPress: () => void
}) => (
  <Pressable onPress={onPress} style={({pressed}) => [styles.action, pressed && styles.pressed]}>
    <MaterialCommunityIcons name={icon} size={18} color={colors.icon} />
    <Text style={styles.actionText}>{label}</Text>
  </Pressable>
)

const styles = StyleSheet.create({
  block: {
    alignItems: 'center',
    rowGap: 10,
  },
  row: {
    flexDirection: 'row',
    columnGap: 10,
    rowGap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,.09)',
  },
  pressed: {
    opacity: 0.65,
  },
  actionText: {
    color: colors.text,
    fontSize: fonts.xs,
    fontWeight: '600',
  },
  note: {
    color: colors.textMutedDarker,
    fontSize: fonts.xs,
    textAlign: 'center',
    maxWidth: 340,
    lineHeight: fonts.xs + 5,
  },
  problem: {
    color: colors.primary,
    fontSize: fonts.xs,
    textAlign: 'center',
    maxWidth: 340,
  },
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
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceDivider,
    marginBottom: 14,
  },
  sheetContent: {
    alignItems: 'center',
    rowGap: 16,
    paddingBottom: 8,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: fonts.base,
    fontWeight: '700',
    textAlign: 'center',
  },
  sheetNote: {
    color: colors.textMuted,
    fontSize: fonts.xs,
    textAlign: 'center',
    maxWidth: 340,
    lineHeight: fonts.xs + 5,
  },
})
