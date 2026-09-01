import React, {useEffect, useRef, useState} from 'react'
import {Pressable, StyleSheet, Text, View} from 'react-native'
import {CameraView, useCameraPermissions} from 'expo-camera'
import {colors, fonts} from '@/constants'

/**
 * The phone reading a code off another screen.
 *
 * This is the side that MOVES a session, not the side that receives one, and
 * that is why it is on the phone at all. A desktop often has no camera; the
 * phone always does, and the phone is also the only thing that can perform the
 * VK login in the first place. So the screen that wants a session shows a code
 * and this reads it — see helpers/authTransfer.ts for the two payloads a code
 * can carry, and why one scanner handles both.
 *
 * The camera permission is asked for HERE rather than at launch. It is the only
 * feature in the app that needs one, and being asked for the camera by a music
 * player before you have pressed anything reads as a shakedown.
 */
export const AuthQrScanner = ({
  onScan,
  size = 280,
}: {
  onScan: (text: string) => void
  size?: number
}) => {
  const [permission, requestPermission] = useCameraPermissions()
  const [asked, setAsked] = useState(false)
  // onBarcodeScanned fires for every frame the code is in view — around sixty
  // times before a hand moves. The first one is the only one that means
  // anything; the rest would re-post the session to an already-filled slot.
  const delivered = useRef(false)

  useEffect(() => {
    if (!permission || permission.granted || asked) return
    if (!permission.canAskAgain) return
    setAsked(true)
    requestPermission().catch((error) => console.warn('==pair: camera permission', error))
  }, [permission, asked, requestPermission])

  if (!permission) {
    return <Frame size={size} text="Starting the camera…" />
  }

  if (!permission.granted) {
    return (
      <Frame size={size} text={
        permission.canAskAgain
          ? 'visky needs the camera to read the code.'
          : 'The camera is blocked for visky in system settings. Enter the code instead.'
      }>
        {permission.canAskAgain && (
          <Pressable
            onPress={() => requestPermission()}
            style={({pressed}) => [styles.allow, pressed && styles.pressed]}
          >
            <Text style={styles.allowText}>Allow the camera</Text>
          </Pressable>
        )}
      </Frame>
    )
  }

  return (
    <View style={[styles.frame, {width: size, height: size}]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{barcodeTypes: ['qr']}}
        onBarcodeScanned={({data}) => {
          if (delivered.current || !data) return
          delivered.current = true
          onScan(data)
        }}
      />
    </View>
  )
}

const Frame = ({
  size,
  text,
  children,
}: {
  size: number
  text: string
  children?: React.ReactNode
}) => (
  <View style={[styles.frame, styles.placeholder, {width: size, height: size}]}>
    <Text style={styles.text}>{text}</Text>
    {children}
  </View>
)

export const canScanQr = true

const styles = StyleSheet.create({
  frame: {
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceDivider,
  },
  placeholder: {
    backgroundColor: colors.surface,
    rowGap: 14,
    paddingHorizontal: 20,
  },
  text: {
    color: colors.textMuted,
    fontSize: fonts.xs,
    textAlign: 'center',
  },
  allow: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  allowText: {
    color: colors.text,
    fontSize: fonts.sm,
    fontWeight: '600',
  },
})
