import React, {useState} from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import {PairingCode} from '@/components/PairingCode'
import {AuthQrScanner, canScanQr} from '@/components/AuthQrScanner'
import {useSession} from '@/components/SessionProvider'
import {colors, fonts, screenPadding} from '@/constants'
import {describePayloadProblem, parseAuthPayload} from '@/helpers/authTransfer'

/**
 * The receiving end of the handover: this screen shows a code and waits for a
 * phone to fill it.
 *
 * It shows rather than reads because it has nothing to put in a code — no
 * session yet — and because the camera worth using is the one on the phone. The
 * phone scans this, confirms the name, and posts its session to the API, which
 * holds it for three minutes and hands it over exactly once.
 *
 * This screen lives in the (auth) group, not in settings, and it has to: a
 * signed-out session cannot reach the tabs at all, so a pairing screen behind
 * the tab bar would be a door locked from the inside.
 */
const PairScreen = () => {
  const {signIn} = useSession()
  const [more, setMore] = useState(false)
  const [pasted, setPasted] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const accept = (text: string) => {
    const session = parseAuthPayload(text)
    if (!session) {
      setProblem(describePayloadProblem(text))
      return
    }
    setProblem(null)
    setBusy(true)
    // No navigation here on purpose: (auth)/_layout redirects to the player the
    // moment the session lands, and racing it would push a screen onto a stack
    // that is being replaced.
    signIn(session)
  }

  const fromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync()
      setPasted(text)
      accept(text)
    } catch (error) {
      console.warn('==pair: clipboard unavailable', error)
      setProblem('Could not read the clipboard. Paste into the box instead.')
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Sign in from your phone</Text>
        <Text style={styles.intro}>
          VK will not let a browser log in — the grant has to come from the phone. So the phone
          hands this one over instead. Open visky there, go to Settings → Add a device, and point it
          at the code below.
        </Text>

        <PairingCode />

        <Pressable onPress={() => setMore((open) => !open)} hitSlop={8} style={styles.moreButton}>
          <Text style={styles.more}>{more ? 'Fewer ways' : 'Other ways'}</Text>
        </Pressable>

        {more && (
          <>
            <Text style={styles.label}>Read a code from a signed-in device</Text>
            {canScanQr ? (
              <AuthQrScanner onScan={accept} />
            ) : (
              <Text style={styles.hint}>No camera here — paste the link instead.</Text>
            )}

            <Text style={styles.label}>…or paste the link</Text>
            <TextInput
              value={pasted}
              onChangeText={(text) => {
                setPasted(text)
                setProblem(null)
              }}
              onSubmitEditing={() => accept(pasted)}
              placeholder="https://…/player/#access_token=…"
              placeholderTextColor={colors.textMutedDarker}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              // A credential, not prose: no autocomplete, no dictionary, no
              // "helpful" first-letter capital in the middle of a token.
              secureTextEntry={false}
            />

            {problem && <Text style={styles.problem}>{problem}</Text>}

            <View style={styles.actions}>
              <Pressable
                onPress={() => accept(pasted)}
                disabled={busy || !pasted.trim()}
                style={({pressed}) => [
                  styles.button,
                  styles.primary,
                  (busy || !pasted.trim()) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.buttonText}>Use this link</Text>
                )}
              </Pressable>

              {Platform.OS !== 'web' && (
                <Pressable
                  onPress={fromClipboard}
                  style={({pressed}) => [styles.button, pressed && styles.pressed]}
                >
                  <Text style={styles.buttonText}>Paste from clipboard</Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.warning}>
              That link is the account itself, not a one-time code. It keeps working until the VK
              token expires — do not leave it in a chat.
            </Text>
          </>
        )}
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
    padding: screenPadding.horizontal + 8,
    paddingTop: 24,
    paddingBottom: 48,
    alignItems: 'center',
    rowGap: 14,
  },
  title: {
    color: colors.text,
    fontSize: fonts.base,
    fontWeight: '700',
    textAlign: 'center',
  },
  intro: {
    color: colors.textMuted,
    fontSize: fonts.xs,
    textAlign: 'center',
    lineHeight: fonts.xs + 6,
    maxWidth: 420,
  },
  moreButton: {
    marginTop: 6,
  },
  more: {
    color: colors.textMuted,
    fontSize: fonts.xs,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  hint: {
    color: colors.textMuted,
    fontSize: fonts.xs,
  },
  label: {
    color: colors.text,
    fontSize: fonts.sm,
    fontWeight: '600',
    marginTop: 8,
  },
  input: {
    width: '100%',
    maxWidth: 460,
    minHeight: 84,
    color: colors.text,
    fontSize: fonts.xs,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    textAlignVertical: 'top',
  },
  problem: {
    color: colors.primary,
    fontSize: fonts.xs,
    textAlign: 'center',
    maxWidth: 420,
  },
  actions: {
    flexDirection: 'row',
    columnGap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,.09)',
  },
  primary: {
    backgroundColor: colors.primary,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.text,
    fontSize: fonts.sm,
    fontWeight: '600',
  },
  warning: {
    color: colors.textMutedDarker,
    fontSize: fonts.xs,
    textAlign: 'center',
    maxWidth: 420,
    marginTop: 8,
  },
})

export default PairScreen
