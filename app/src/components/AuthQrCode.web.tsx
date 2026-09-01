import React, {useEffect, useState} from 'react'
import {ActivityIndicator, Image, StyleSheet, Text, View} from 'react-native'
import QRCode from 'qrcode'
import {colors, fonts} from '@/constants'

/**
 * Same QR, but a browser renders SVG in an <img> directly — react-native-web's
 * Image is one. No WebView here: on web that specifier resolves to the Electron
 * shim (see metro.config.js), which is not a browser thing at all.
 */
export const AuthQrCode = ({value, size = 260}: {value: string; size?: number}) => {
  const [uri, setUri] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setUri(null)
    setFailed(false)
    // `width` is not cosmetic here: without it qrcode emits an SVG with only a
    // viewBox, and an <img> pointing at a data URI with no intrinsic size loads
    // to a blank box in Chrome — silently, no error, no onError. That is
    // exactly what it did.
    QRCode.toString(value, {type: 'svg', margin: 1, errorCorrectionLevel: 'L', width: size})
      .then((markup) => {
        if (!cancelled) setUri(`data:image/svg+xml;base64,${btoa(markup)}`)
      })
      .catch((error) => {
        console.warn('==pair: could not encode the QR', error)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [value, size])

  return (
    <View style={[styles.plate, {width: size, height: size}]}>
      {failed ? (
        <Text style={styles.error}>Could not draw the code</Text>
      ) : uri ? (
        <Image source={{uri}} style={{width: size, height: size}} resizeMode="contain" />
      ) : (
        <ActivityIndicator color={colors.background} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  plate: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#111',
    fontSize: fonts.xs,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
})
