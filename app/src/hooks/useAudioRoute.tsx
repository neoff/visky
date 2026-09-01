import {useEffect, useState} from 'react'
import {AppState} from 'react-native'
import {AudioRoute, AudioRouteSnapshot} from '../../modules/audio-route'

/**
 * The output this device is sending sound to, kept live.
 *
 * Two sources, and both are needed:
 *  - the native route-change event, which covers unplugging headphones or a
 *    Bluetooth set connecting while the app is open;
 *  - AppState becoming `active`, which is how a switch made in the system
 *    picker gets back to us. On Android that picker is a separate Settings
 *    activity, so no route event reaches a backgrounded app.
 */
export const useAudioRoute = (): AudioRouteSnapshot => {
  const [snapshot, setSnapshot] = useState<AudioRouteSnapshot>(() => AudioRoute.getRoutes())

  useEffect(() => {
    const route = AudioRoute.addRouteListener(setSnapshot)
    const app = AppState.addEventListener('change', (status) => {
      if (status === 'active') setSnapshot(AudioRoute.getRoutes())
    })
    // The first read happened during the initial render, before the listener
    // existed; re-read once in case the route changed in between.
    setSnapshot(AudioRoute.getRoutes())

    return () => {
      route.remove()
      app.remove()
    }
  }, [])

  return snapshot
}
