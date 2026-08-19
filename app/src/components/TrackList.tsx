import { unknownTrackImageUri } from "@/constants/images";
import { utilsStyles } from '@/styles';
import {ActivityIndicator, FlatList, FlatListProps, Text, View} from "react-native";
import FastImage from "react-native-fast-image";
import TrackPlayer, {Track, TrackType} from 'react-native-track-player';
import { TrackListItem } from './TrackListItem';
import {useQueue} from "@/store/queue";
import {useRef} from "react";
import {FlashList, FlashListProps} from "@shopify/flash-list";
import unknownTrackImage from '@/assets/unknown_track.png'

export type TrackListProps = Partial<FlashListProps<unknown>> & {
  id: string
  tracks: Track[]
  refresh?: boolean
  hideQueueControls?: boolean
}

export const TrackList = ({
                            id,
                            tracks,
                            hideQueueControls = false,
                            refresh = false,
                            ...flatListProps
                          }: TrackListProps) => {
  const queueOffset = useRef(0)
  const { activeQueueId, setActiveQueueId } = useQueue()

  /*const handleTrackSelect = async (selectedTrack: Track) => {
    console.log('Selected track', selectedTrack)
    if (selectedTrack.url === '') return
    await TrackPlayer.load(selectedTrack)
    await TrackPlayer.play()
  }*/
  const handleTrackSelect = async (selectedTrack: Track) => {
    console.log('Selected track', selectedTrack)
    const playableTracks = tracks.filter(
      (track) => typeof track.url === 'string' && track.url.trim().length > 0,
    )
    const trackIndex = playableTracks.findIndex((track) => track.url === selectedTrack.url)
    if (trackIndex === -1) {
      console.warn('Selected track has no playable URL', selectedTrack.id)
      return
    }

    const isChangingQueue = id !== activeQueueId
    console.log(`isChangingQueue:${isChangingQueue} id:${id} activeQueueId:${activeQueueId}`)
    try {
      if (isChangingQueue) {
        const beforeTracks = playableTracks.slice(0, trackIndex)
        const afterTracks = playableTracks.slice(trackIndex + 1)
        const queue = [selectedTrack, ...afterTracks, ...beforeTracks].map((track) => ({
          ...track,
          type: TrackType.HLS,
        }))

        await TrackPlayer.reset()
        await TrackPlayer.add(queue)
        await TrackPlayer.play()

        queueOffset.current = trackIndex
        setActiveQueueId(id)
      } else {
        const nextTrackIndex =
          trackIndex - queueOffset.current < 0
            ? playableTracks.length + trackIndex - queueOffset.current
            : trackIndex - queueOffset.current

        await TrackPlayer.skip(nextTrackIndex)
        await TrackPlayer.play()
      }
    } catch (error) {
      console.warn('Unable to start selected track', error)
    }
  }
  console.log('TrackList', unknownTrackImageUri, unknownTrackImage)
  return (
    <FlashList
      data={tracks}
      contentContainerStyle={{paddingTop: 10, paddingBottom: 128}}
      /*ListHeaderComponent={
        !hideQueueControls ? (
          <QueueControls tracks={tracks} style={{ paddingBottom: 20 }} />
        ) : undefined
      }*/
      ListFooterComponent={ItemDivider}
      ItemSeparatorComponent={ItemDivider}
      ListEmptyComponent={
        <View>
          <Text style={utilsStyles.emptyContentText}>No songs found</Text>

          <FastImage
            source={{uri: unknownTrackImageUri, priority: FastImage.priority.normal}}
            style={utilsStyles.emptyContentImage}
          />
        </View>
      }
      renderItem={({ item: track }) => (
        <TrackListItem  onTrackSelect={handleTrackSelect} track={track as Track} />
      )}
      {...flatListProps}
    />
  )
}


const ItemDivider = () => {
  return <View style={{...utilsStyles.itemSeparator}}/>
}
