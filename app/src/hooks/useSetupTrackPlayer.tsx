import { useEffect } from 'react';
import { ensureTrackPlayer } from '@/services/trackPlayer';

/**
 * The UI's way in. The setup itself lives in services/trackPlayer, because the
 * car can need it in a runtime where no component ever mounts.
 */
export const useSetupTrackPlayer = ({onLoad, init}: { onLoad: () => void, init:boolean }) => {
  useEffect(() => {
    console.log('-TRY->useSetupTrackPlayer')
    if (init) return
    console.log('-->useSetupTrackPlayer')
    ensureTrackPlayer()
      .then(() => {
        onLoad?.()
      })
      .catch((error) => {
        console.error(error)
      })
  }, [onLoad])
}
