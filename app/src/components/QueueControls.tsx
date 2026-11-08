import { defaultStyles } from '@/styles'
import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View, ViewProps } from 'react-native'
import { TouchableOpacity } from 'react-native-gesture-handler'
import TrackPlayer, { Track } from 'react-native-track-player'
import {colors} from "@/constants";
import {expandTracks} from "@/helpers/parts";

type QueueControlsProps = {
	tracks: Track[]
} & ViewProps

export const QueueControls = ({ tracks, style, ...viewProps }: QueueControlsProps) => {
	const handlePlay = async () => {
		// expand v2 multipart rows into their per-part queue entries (no-op on v1)
		await TrackPlayer.setQueue(expandTracks(tracks))
		await TrackPlayer.play()
	}

	const handleShufflePlay = async () => {
		// shuffle the ROWS, then expand — a show's parts stay together and in order
		const shuffledTracks = [...tracks].sort(() => Math.random() - 0.5)

		await TrackPlayer.setQueue(expandTracks(shuffledTracks))
		await TrackPlayer.play()
	}

	return (
		<View style={[{ flexDirection: 'row', columnGap: 16 }, style]} {...viewProps}>
			{/* Play button */}
			<View style={{ flex: 1 }}>
				<TouchableOpacity onPress={handlePlay} activeOpacity={0.8} style={styles.button}>
					<Ionicons name="play" size={22} color={colors.primary} />

					<Text style={styles.buttonText}>Play</Text>
				</TouchableOpacity>
			</View>

			{/* Shuffle button */}
			<View style={{ flex: 1 }}>
				<TouchableOpacity onPress={handleShufflePlay} activeOpacity={0.8} style={styles.button}>
					<Ionicons name={'shuffle-sharp'} size={24} color={colors.primary} />

					<Text style={styles.buttonText}>Shuffle</Text>
				</TouchableOpacity>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	button: {
		padding: 12,
		backgroundColor: 'rgba(47, 47, 47, 0.5)',
		borderRadius: 8,
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		columnGap: 8,
	},
	buttonText: {
		...defaultStyles.text,
		color: colors.primary,
		fontWeight: '600',
		fontSize: 18,
		textAlign: 'center',
	},
})
