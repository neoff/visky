import { useCallback, useEffect, useState } from 'react'
import TrackPlayer from 'react-native-track-player'

export const useTrackPlayerVolume = () => {
	const [volume, setVolume] = useState<number | undefined>(undefined)

	// Both calls are guarded: the player may not be set up yet when the screen
	// first mounts, and on the web build the volume is the media element's,
	// which the shim does not always expose. A volume control that cannot read
	// the volume should sit still, not throw into an unhandled rejection.
	const getVolume = useCallback(async () => {
		try {
			setVolume(await TrackPlayer.getVolume())
		} catch (error) {
			console.warn('==player: could not read the volume', error)
		}
	}, [])

	const updateVolume = useCallback(async (newVolume: number) => {
		if (newVolume < 0 || newVolume > 1) return

		setVolume(newVolume)

		try {
			await TrackPlayer.setVolume(newVolume)
		} catch (error) {
			console.warn('==player: could not set the volume', error)
		}
	}, [])

	useEffect(() => {
		getVolume()
	}, [getVolume])

	return { volume, updateVolume }
}
