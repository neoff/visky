// src/components/TrackList.tsx
import { unknownTrackImageUri } from "@/constants/images";
import { utilsStyles } from '@/styles';
import {Text, View} from "react-native";
import { Image } from 'expo-image';
import TrackPlayer, {RepeatMode, Track, TrackType} from 'react-native-track-player';
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
    console.log('Selected track url', selectedTrack.url)
    if (selectedTrack.url === '') return
    const trackIndex = tracks.findIndex((track) => track.url === selectedTrack.url)
    console.log('trackIndex', trackIndex)
    if (trackIndex === -1) return

    const isChangingQueue = id !== activeQueueId
    console.log(`isChangingQueue:${isChangingQueue} id:${id} activeQueueId:${activeQueueId}`)
    if (isChangingQueue) {
      console.log(`isChangingQueue:${isChangingQueue} id:${id} activeQueueId:${activeQueueId}`)
      const beforeTracks = tracks.slice(0, trackIndex)
      const afterTracks = tracks.slice(trackIndex + 1)

      await TrackPlayer.reset()

      // we construct the new queue
      await TrackPlayer.add({...selectedTrack, type: TrackType.HLS})
      await TrackPlayer.add(afterTracks.filter(t => !!t.url))
      await TrackPlayer.add(beforeTracks.filter(t => !!t.url))

      await TrackPlayer.play()
      setTimeout(async () => {
        const state = await TrackPlayer.getPlaybackState();
        const currentTrack = await TrackPlayer.getActiveTrackIndex();
        console.log("🎧 Player state:", state);
        console.log("🎶 Current track:", currentTrack);
      }, 1000);

      queueOffset.current = trackIndex
      setActiveQueueId(id)
    } else {
      console.log(`!! isChangingQueue:${isChangingQueue} queueOffset.current:${queueOffset.current} trackIndex:${trackIndex}`)
      const nextTrackIndex =
        trackIndex - queueOffset.current < 0
          ? tracks.length + trackIndex - queueOffset.current
          : trackIndex - queueOffset.current

      await TrackPlayer.skip(nextTrackIndex)
      await TrackPlayer.play()
      setTimeout(async () => {
        const state = await TrackPlayer.getPlaybackState();
        const currentTrack = await TrackPlayer.getActiveTrackIndex();
        console.log("🎧 Player state:", state);
        console.log("🎶 Current track:", currentTrack);
      }, 1000);
    }
  }
  console.log('TrackList', unknownTrackImageUri, unknownTrackImage)
  return (
    <FlashList
      data={tracks}
      estimatedItemSize={tracks.length || 1}
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

          <Image
            source={unknownTrackImageUri}
            style={utilsStyles.emptyContentImage}
            contentFit="cover"
            transition={100}
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