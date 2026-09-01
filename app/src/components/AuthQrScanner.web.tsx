import React, {useEffect, useRef, useState} from 'react'
import {StyleSheet, Text, View} from 'react-native'
import jsQR from 'jsqr'
import {colors, fonts} from '@/constants'

/**
 * Reads the phone's QR with the laptop's camera.
 *
 * Two decoders, in this order:
 *  1. `BarcodeDetector` — native, in Chrome/Edge, and by far the cheaper one;
 *  2. `jsQR` over a canvas frame — everywhere else (Safari, Firefox).
 *
 * The camera only exists in a SECURE context: https, or localhost. Served from
 * frisky.envarg.com that is satisfied; opened as a file:// it never will be, and
 * the error below says so rather than hanging on a black rectangle.
 *
 * Web-only by design. The phone is the side that HAS the session — it shows the
 * code, it does not need to read one — and putting a camera permission into the
 * mobile builds to support a case nobody has is not a trade worth making.
 */
export const AuthQrScanner = ({
  onScan,
  size = 280,
}: {
  onScan: (text: string) => void
  size?: number
}) => {
  const holder = useRef<View | null>(null)
  // The camera prompt can sit unanswered for a long time, and a black square
  // with nothing under it reads as broken rather than as waiting.
  const [status, setStatus] = useState<string | null>('Waiting for camera permission…')
  // The callback must not restart the camera when the parent re-renders.
  const deliver = useRef(onScan)
  deliver.current = onScan

  useEffect(() => {
    const node = holder.current as unknown as HTMLElement | null
    if (!node) return

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('This browser has no camera access. Paste the link instead.')
      return
    }

    let stream: MediaStream | null = null
    let frame = 0
    let stopped = false
    let done = false

    const video = document.createElement('video')
    video.setAttribute('playsinline', 'true')
    video.muted = true
    video.style.width = '100%'
    video.style.height = '100%'
    video.style.objectFit = 'cover'
    node.appendChild(video)

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', {willReadFrequently: true})

    const Detector = (window as any).BarcodeDetector
    const detector = Detector ? new Detector({formats: ['qr_code']}) : null

    const handle = (text: string | null | undefined) => {
      if (!text || done) return
      done = true
      deliver.current(text)
    }

    const tick = async () => {
      if (stopped || done) return
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
          if (detector) {
            const found = await detector.detect(video)
            handle(found?.[0]?.rawValue)
          } else if (context) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            context.drawImage(video, 0, 0, canvas.width, canvas.height)
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
            handle(jsQR(pixels.data, pixels.width, pixels.height)?.data)
          }
        } catch (failure) {
          // A single bad frame is normal — mid-resize, or the tab going
          // background. Only a broken stream is worth reporting, and that
          // surfaces through getUserMedia instead.
          console.debug('==pair: frame skipped', failure)
        }
      }
      if (!stopped && !done) frame = requestAnimationFrame(tick)
    }

    navigator.mediaDevices
      .getUserMedia({video: {facingMode: 'environment'}})
      .then((granted) => {
        if (stopped) {
          granted.getTracks().forEach((track) => track.stop())
          return
        }
        stream = granted
        video.srcObject = granted
        return video.play()
      })
      .then(() => {
        if (stopped) return
        setStatus(null)
        frame = requestAnimationFrame(tick)
      })
      .catch((failure) => {
        console.warn('==pair: camera unavailable', failure)
        setStatus(
          failure?.name === 'NotAllowedError'
            ? 'Camera permission was refused. Paste the link instead.'
            : 'No camera available here. Paste the link instead.',
        )
      })

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
      video.srcObject = null
      video.remove()
    }
  }, [])

  return (
    <View style={[styles.frame, {width: size, height: size}]} ref={holder}>
      {status && <Text style={styles.status}>{status}</Text>}
    </View>
  )
}

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
  status: {
    color: colors.textMuted,
    fontSize: fonts.xs,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
})
