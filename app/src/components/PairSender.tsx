import React, {useState} from 'react'
import {ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View} from 'react-native'
import {AuthQrScanner, canScanQr} from '@/components/AuthQrScanner'
import {useSession} from '@/components/SessionProvider'
import {colors, fonts} from '@/constants'
import {describePayloadProblem, formatPairCode, readAnyCode} from '@/helpers/authTransfer'
import {claimPairing, peekPairing} from '@/helpers/network'
import {AuthFragments} from '@/types/auth'

/**
 * "Add a device" — the phone handing its session to a screen that cannot log in.
 *
 * One scanner, two payloads, because a code held up to a phone can mean either
 * direction of the handover:
 *
 *  - a PAIRING code (a computer waiting to be signed in) — this device sends;
 *  - a SESSION code (the older payload, drawn by a signed-in phone) — this
 *    device receives, which is how a new phone is set up from an old one.
 *
 * They are told apart by their content, not by which button was pressed, so
 * pointing the camera at either one does the obvious thing. See
 * helpers/authTransfer.ts.
 */
type Stage =
  | {step: 'reading'}
  | {step: 'confirming'; target: string; name: string}
  | {step: 'sending'}
  | {step: 'sent'; name: string}

export const PairSender = ({
  onReceive,
  onDone,
}: {
  /** A session read off another device, when the code turned out to be one. */
  onReceive?: (session: AuthFragments) => void
  onDone?: () => void
}) => {
  const {signIn} = useSession()
  const [stage, setStage] = useState<Stage>({step: 'reading'})
  const [typed, setTyped] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  /**
   * The scanner delivers exactly one code and then stops, so every return to
   * the reading step needs a fresh mount. Keying on the error message is not
   * enough — cancelling a confirmation clears it back to the value it already
   * had, and the camera would sit there decoded-out and dead.
   */
  const [attempt, setAttempt] = useState(0)
  const readAgain = (why: string | null) => {
    setProblem(why)
    setAttempt((n) => n + 1)
    setStage({step: 'reading'})
  }

  const read = async (text: string) => {
    const code = readAnyCode(text)
    if (!code) {
      // A short string was meant to be a pairing code; a long one was meant to
      // be a session link, and describePayloadProblem says which field is
      // missing from it.
      setProblem(
        text.trim().length <= 12
          ? 'That code is not right — check the characters.'
          : describePayloadProblem(text),
      )
      return
    }

    if (code.kind === 'session') {
      setProblem(null)
      if (onReceive) onReceive(code.session)
      else signIn(code.session)
      onDone?.()
      return
    }

    setProblem(null)
    const target = code.pointer.code ?? code.pointer.id
    // The name in the code is what the waiting screen calls itself; asking the
    // API confirms the slot is still open before the user is shown a question
    // they can only answer wrong.
    const seen = await peekPairing(target).catch(() => null)
    if (!seen) {
      readAgain('That code has expired. Ask the other screen for a new one.')
      return
    }
    setStage({step: 'confirming', target, name: seen.name})
  }

  const send = async (target: string, name: string) => {
    setStage({step: 'sending'})
    const outcome = await claimPairing(target).catch((error) => {
      console.warn('==pair: claim failed', error)
      return 'refused' as const
    })

    if (outcome === 'ok') {
      setStage({step: 'sent', name})
      return
    }
    readAgain(
      outcome === 'expired'
        ? 'That code expired before it went through. Ask for a new one.'
        : outcome === 'taken'
          ? 'That code was already used by another device.'
          : 'The server would not accept this session. Try signing in again on this phone.',
    )
  }

  if (stage.step === 'sending') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.icon} />
        <Text style={styles.note}>Sending the session…</Text>
      </View>
    )
  }

  if (stage.step === 'sent') {
    return (
      <View style={styles.centered}>
        <Text style={styles.headline}>Signed in on {stage.name}.</Text>
        <Text style={styles.note}>
          That screen keeps this account until the VK token expires or you sign out there.
        </Text>
        <Pressable onPress={onDone} style={({pressed}) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Done</Text>
        </Pressable>
      </View>
    )
  }

  if (stage.step === 'confirming') {
    return (
      <View style={styles.centered}>
        <Text style={styles.headline}>Sign in on {stage.name}?</Text>
        <Text style={styles.warning}>
          That device gets this VK account — the library, the favourites and playback control. It
          keeps it until the token expires. Only do this for a screen you own.
        </Text>
        <View style={styles.row}>
          <Pressable
            onPress={() => send(stage.target, stage.name)}
            style={({pressed}) => [styles.button, styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>Send the session</Text>
          </Pressable>
          <Pressable
            onPress={() => readAgain(null)}
            style={({pressed}) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.centered}>
      {canScanQr ? (
        <AuthQrScanner key={attempt} onScan={read} />
      ) : null}

      <Text style={styles.note}>
        Point the camera at the code on the other screen — or type it below.
      </Text>

      <TextInput
        value={typed}
        onChangeText={(text) => {
          setTyped(formatPairCode(text.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8)))
          setProblem(null)
        }}
        onSubmitEditing={() => read(typed)}
        placeholder="ABCD-2345"
        placeholderTextColor={colors.textMutedDarker}
        style={styles.input}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      {problem && <Text style={styles.problem}>{problem}</Text>}

      <Pressable
        onPress={() => read(typed)}
        disabled={typed.replace(/-/g, '').length < 8}
        style={({pressed}) => [
          styles.button,
          typed.replace(/-/g, '').length < 8 && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.buttonText}>Use this code</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    rowGap: 12,
  },
  headline: {
    color: colors.text,
    fontSize: fonts.base,
    fontWeight: '700',
    textAlign: 'center',
  },
  note: {
    color: colors.textMuted,
    fontSize: fonts.xs,
    textAlign: 'center',
    maxWidth: 340,
    lineHeight: fonts.xs + 5,
  },
  warning: {
    color: colors.textMutedDarker,
    fontSize: fonts.xs,
    textAlign: 'center',
    maxWidth: 340,
    lineHeight: fonts.xs + 5,
  },
  input: {
    width: '100%',
    maxWidth: 260,
    color: colors.text,
    fontSize: fonts.base,
    letterSpacing: 3,
    textAlign: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 12,
  },
  problem: {
    color: colors.primary,
    fontSize: fonts.xs,
    textAlign: 'center',
    maxWidth: 340,
  },
  row: {
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
})
