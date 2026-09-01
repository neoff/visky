import React from 'react'
import {Image, ImageResizeMode, ImageStyle, StyleProp, StyleSheet, View} from 'react-native'

/**
 * `react-native-fast-image` for the web build.
 *
 * FastImage exists to give Android a real disk cache and priority queue. A
 * browser already has both, so the whole component collapses into RN Web's
 * `Image` — which is a `<img>`, which Chromium caches for us.
 *
 * This is a shim rather than a `.web.tsx` next to each call site because the
 * import is `react-native-fast-image` in six files; metro.config.js points that
 * specifier here for platform `web` and leaves the native builds untouched.
 *
 * The crash it fixes: fast-image calls `Image.resolveAssetSource`, which
 * react-native-web does not implement, so the module threw while it was still
 * being evaluated and the whole bundle died before the first render.
 */

type FastImageSource = {
  uri?: string
  headers?: Record<string, string>
  /** Honoured on Android, meaningless here — dropped before it reaches `<img>`. */
  priority?: string
  cache?: string
}

type FastImageProps = {
  source: FastImageSource | number
  style?: StyleProp<ImageStyle>
  resizeMode?: ImageResizeMode
  tintColor?: string
  onLoad?: () => void
  onError?: () => void
  onLoadStart?: () => void
  onLoadEnd?: () => void
  testID?: string
  children?: React.ReactNode
}

const FastImage = ({source, style, resizeMode, children, ...rest}: FastImageProps) => {
  // A number is a bundled asset (`require('...png')`) and passes straight
  // through. An object keeps only the keys RN Web understands: `priority` and
  // `cache` on a web `source` produce a console warning and nothing else.
  const normalized =
    typeof source === 'number'
      ? source
      : {uri: source?.uri, ...(source?.headers ? {headers: source.headers} : {})}

  if (!children) {
    return <Image source={normalized} style={style} resizeMode={resizeMode} {...rest} />
  }

  // FastImage renders children ON TOP of the image; RN Web's Image takes no
  // children at all (RN dropped that from ImageProps). Same result, one wrapper.
  return (
    <View style={style}>
      <Image
        source={normalized}
        style={StyleSheet.absoluteFill as StyleProp<ImageStyle>}
        resizeMode={resizeMode}
        {...rest}
      />
      {children}
    </View>
  )
}

FastImage.priority = {low: 'low', normal: 'normal', high: 'high'} as const
FastImage.resizeMode = {
  contain: 'contain',
  cover: 'cover',
  stretch: 'stretch',
  center: 'center',
} as const
FastImage.cacheControl = {immutable: 'immutable', web: 'web', cacheOnly: 'cacheOnly'} as const

/** The browser decides what to keep; these exist so callers do not crash. */
FastImage.preload = (sources: FastImageSource[]): void => {
  for (const source of sources) {
    if (!source?.uri) continue
    const image = new window.Image()
    image.src = source.uri
  }
}
FastImage.clearMemoryCache = async (): Promise<void> => {}
FastImage.clearDiskCache = async (): Promise<void> => {}

export default FastImage
