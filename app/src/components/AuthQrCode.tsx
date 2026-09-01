import React, {useEffect, useState} from 'react'
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native'
import QRCode from 'qrcode'
import {WebView} from 'react-native-webview'
import {colors, fonts} from '@/constants'

/**
 * The QR the browser scans. Rendered as an SVG string by `qrcode` (its browser
 * build is pure JS — no canvas, no native anything) and shown inside the WebView
 * the app already ships for the VK login.
 *
 * The alternative was drawing ~3500 modules as <View>s, or pulling in
 * react-native-svg for one screen. This needs neither.
 */
export const AuthQrCode = ({value, size = 260}: {value: string; size?: number}) => {
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSvg(null)
    setFailed(false)
    QRCode.toString(value, {type: 'svg', margin: 1, errorCorrectionLevel: 'L', width: size})
      .then((markup) => {
        if (!cancelled) setSvg(markup)
      })
      .catch((error) => {
        console.warn('==pair: could not encode the QR', error)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [value, size])

  if (failed) {
    return (
      <View style={[styles.plate, {width: size, height: size}]}>
        <Text style={styles.error}>Could not draw the code</Text>
      </View>
    )
  }

  if (!svg) {
    return (
      <View style={[styles.plate, {width: size, height: size}]}>
        <ActivityIndicator color={colors.background} />
      </View>
    )
  }

  return (
    <View style={[styles.plate, {width: size, height: size}]}>
      <WebView
        originWhitelist={['*']}
        source={{html: page(svg)}}
        style={{width: size, height: size, backgroundColor: '#fff'}}
        scrollEnabled={false}
        // A QR is a picture: nothing here should scale with the system font or
        // scroll, and nothing in it is a link.
        scalesPageToFit={false}
        javaScriptEnabled={false}
      />
    </View>
  )
}

const page = (svg: string) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;height:100%;background:#fff;display:flex;align-items:center;justify-content:center}
svg{width:100%;height:100%;display:block}
</style></head><body>${svg}</body></html>`

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
