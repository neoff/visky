import React, {useCallback, useEffect, useState} from 'react'
import {ActivityIndicator, Platform, Pressable, StyleSheet, Text, View} from 'react-native'
import Constants from 'expo-constants'
import {AuthQrCode} from '@/components/AuthQrCode'
import {useSession} from '@/components/SessionProvider'
import {colors, fonts} from '@/constants'
import {buildPairingLink, formatPairCode} from '@/helpers/authTransfer'
import {collectPairing, openPairing, PairTicket} from '@/helpers/network'

/**
 * "Sign this screen in from your phone."
 *
 * The receiving end of the handover, and the side WITHOUT a session — which is
 * exactly why it shows the code rather than reads one. It has no credentials to
 * put in a QR; what it shows is a pointer to a slot the API is holding open for
 * three minutes, and the phone posts the session into it.
 *
 * Used by every screen that cannot log in on its own: the web player, the
 * desktop app, and a freshly installed phone being set up from one that is
 * already signed in.
 */
const POLL_MS = 1500

export const PairingCode = ({size = 240}: {size?: number}) => {
  const {signIn} = useSession()
  const [ticket, setTicket] = useState<PairTicket | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [left, setLeft] = useState(0)
  /** Bumped to throw the current code away and ask for a fresh one. */
  const [round, setRound] = useState(0)

  const open = useCallback(() => {
    setProblem(null)
    setTicket(null)
    setRound((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async (pairId: string) => {
      if (cancelled) return
      try {
        const result = await collectPairing(pairId)
        if (cancelled) return

        if (result.state === 'session') {
          // No navigation here: (auth)/_layout redirects the moment the session
          // lands, and racing it pushes onto a stack being replaced.
          signIn(result.session)
          return
        }
        if (result.state === 'gone') {
          setProblem('That code expired. Show a new one.')
          return
        }
      } catch (error) {
        console.warn('==pair: could not reach the API', error)
        setProblem('Cannot reach the server. Check the connection and try again.')
        return
      }
      timer = setTimeout(() => poll(pairId), POLL_MS)
    }

    openPairing(deviceName(), Platform.OS)
      .then((opened) => {
        if (cancelled) return
        setTicket(opened)
        setLeft(opened.expires_in)
        poll(opened.pair_id)
      })
      .catch((error) => {
        console.warn('==pair: could not open a pairing', error)
        if (!cancelled) setProblem('Could not reach the server to start pairing.')
      })

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [round, signIn])

  // A code with no visible clock looks broken the moment it stops working.
  useEffect(() => {
    if (!ticket) return
    const clock = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(clock)
  }, [ticket])

  if (problem) {
    return (
      <View style={styles.block}>
        <Text style={styles.problem}>{problem}</Text>
        <Pressable onPress={open} style={({pressed}) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Show a new code</Text>
        </Pressable>
      </View>
    )
  }

  if (!ticket) {
    return (
      <View style={[styles.block, {minHeight: size}]}>
        <ActivityIndicator color={colors.icon} />
      </View>
    )
  }

  return (
    <View style={styles.block}>
      <AuthQrCode value={buildPairingLink({id: ticket.pair_id, code: ticket.code, name: ticket.name})} size={size} />

      <Text style={styles.code}>{formatPairCode(ticket.code)}</Text>
      <Text style={styles.note}>
        On your phone: Settings → Add a device, then point it here. Or type this code there.
      </Text>

      <Text style={styles.clock}>
        {left > 0 ? `This code works for another ${minutes(left)}.` : 'This code has expired.'}
      </Text>
      {left <= 0 && (
        <Pressable onPress={open} style={({pressed}) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Show a new code</Text>
        </Pressable>
      )}
    </View>
  )
}

/**
 * What the phone will call this screen. It is shown to the person holding the
 * phone so they can tell "my laptop" from "someone else's request", so the more
 * recognisable the better — but it is self-declared, and the confirmation on the
 * phone is what actually authorises the handover.
 */
const deviceName = (): string => {
  if (Constants.deviceName) return Constants.deviceName
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    const agent = navigator.userAgent ?? ''
    const browser = /Firefox/.test(agent)
      ? 'Firefox'
      : /Edg\//.test(agent)
        ? 'Edge'
        : /Chrome/.test(agent)
          ? 'Chrome'
          : /Safari/.test(agent)
            ? 'Safari'
            : 'a browser'
    const os = /Mac/.test(agent) ? 'Mac' : /Windows/.test(agent) ? 'Windows' : /Linux/.test(agent) ? 'Linux' : ''
    return os ? `${os} (${browser})` : browser
  }
  return `${Platform.OS} device`
}

const minutes = (seconds: number): string => {
  if (seconds >= 60) {
    const whole = Math.round(seconds / 60)
    return whole === 1 ? 'minute' : `${whole} minutes`
  }
  return `${seconds} seconds`
}

const styles = StyleSheet.create({
  block: {
    alignItems: 'center',
    rowGap: 12,
  },
  code: {
    color: colors.text,
    fontSize: fonts.base + 4,
    fontWeight: '700',
    letterSpacing: 4,
    fontFamily: Platform.select({ios: 'Menlo', android: 'monospace', default: 'monospace'}),
  },
  note: {
    color: colors.textMuted,
    fontSize: fonts.xs,
    textAlign: 'center',
    maxWidth: 340,
    lineHeight: fonts.xs + 5,
  },
  clock: {
    color: colors.textMutedDarker,
    fontSize: fonts.xs,
  },
  problem: {
    color: colors.primary,
    fontSize: fonts.xs,
    textAlign: 'center',
    maxWidth: 340,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,.09)',
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
