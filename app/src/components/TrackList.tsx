import { unknownTrackImageUri } from "@/constants/images";
import { colors, layout } from '@/constants';
import { isSameTrack, trackKey } from '@/helpers/miscellaneous';
import { utilsStyles } from '@/styles';
import {ActivityIndicator, FlatList, FlatListProps, Text, View} from "react-native";
import FastImage from "react-native-fast-image";
import TrackPlayer, {Track, TrackType} from 'react-native-track-player';
import { TrackListItem } from './TrackListItem';
import {useQueue} from "@/store/queue";
import {runLocalAction} from "@/services/playbackReconciler";
import {FlashList, FlashListProps} from "@shopify/flash-list";
import unknownTrackImage from '@/assets/unknown_track.png'

/** a heading between two groups of rows, e.g. "Suggested for you" */
export type TrackListSection = {__section: string}

const isSection = (item: unknown): item is TrackListSection =>
  typeof item === 'object' && item !== null && '__section' in (item as any)

export type TrackListProps = Partial<FlashListProps<unknown>> & {
  id: string
  tracks: (Track | TrackListSection)[]
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
  const { activeQueueId, setActiveQueueId } = useQueue()

  /*const handleTrackSelect = async (selectedTrack: Track) => {
    console.log('Selected track', selectedTrack)
    if (selectedTrack.url === '') return
    await TrackPlayer.load(selectedTrack)
    await TrackPlayer.play()
  }*/
  const handleTrackSelect = async (selectedTrack: Track) => {
    const playableTracks = (tracks.filter((item) => !isSection(item)) as Track[]).filter(
      (track) => typeof track.url === 'string' && track.url.trim().length > 0,
    )
    const trackIndex = playableTracks.findIndex((track) => isSameTrack(track, selectedTrack))
    if (trackIndex === -1) {
      console.warn('Selected track has no playable URL', selectedTrack.id)
      return
    }

    try {
      // Inside the session's own lock. The reconciler rebuilds the queue from
      // the account's playback state, and on a device that has just connected
      // it does so at an unpredictable moment — right on top of this, which is
      // how tapping one track started a different one.
      await runLocalAction(async () => {
        // Skip inside the queue the PLAYER actually holds, looked up by track
        // id. The old code kept its own `queueOffset` ref and did index
        // arithmetic against the on-screen list: the ref is re-created whenever
        // TrackList remounts while `activeQueueId` survives in the zustand
        // store, and a refresh can reorder the list without changing the queue
        // id — both make the arithmetic point at a DIFFERENT track. Asking the
        // player is exact.
        const currentQueue = await TrackPlayer.getQueue()
        const indexInQueue = currentQueue.findIndex((queueTrack) =>
          isSameTrack(queueTrack, selectedTrack),
        )

        if (id === activeQueueId && indexInQueue !== -1) {
          await TrackPlayer.skip(indexInQueue)
          await TrackPlayer.play()
          return
        }

        // different list (or the track is not queued): rebuild the queue
        // starting at the selected track
        const beforeTracks = playableTracks.slice(0, trackIndex)
        const afterTracks = playableTracks.slice(trackIndex + 1)
        const queue = [selectedTrack, ...afterTracks, ...beforeTracks].map((track) => ({
          ...track,
          type: TrackType.HLS,
        }))

        await TrackPlayer.reset()
        await TrackPlayer.add(queue)
        await TrackPlayer.play()

        setActiveQueueId(id)
      })
    } catch (error) {
      console.warn('Unable to start selected track', error)
    }
  }
  return (
    <FlashList
      data={tracks}
      // the list scrolls ITSELF now. It used to sit inside a ScrollView with
      // scrollEnabled={false}, which meant every row was mounted at once and
      // paging was impossible — the archive is thousands of tracks long.
      contentContainerStyle={{paddingTop: 10, paddingBottom: layout.tabBarContentHeight + 80}}
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
      // Stable identity per row. FlashList falls back to the index otherwise,
      // and the index of a track CHANGES whenever the window drops a page at
      // the front or prepends one — which is exactly when
      // `maintainVisibleContentPosition` needs to anchor on the row the user is
      // looking at.
      keyExtractor={(item, index) =>
        isSection(item) ? `section-${item.__section}` : trackKey(item as Track) ?? `row-${index}`
      }
      renderItem={({ item: track }) => (
        isSection(track)
          ? <SectionHeading title={track.__section}/>
          : <TrackListItem onTrackSelect={handleTrackSelect} track={track as Track} />
      )}
      {...flatListProps}
    />
  )
}


const ItemDivider = () => {
  return <View style={{...utilsStyles.itemSeparator}}/>
}

const SectionHeading = ({title}: {title: string}) => (
  <View>
    <View style={{height: 1, backgroundColor: colors.surfaceDivider, marginTop: 24}}/>
    <Text style={{color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 4}}>
      {title}
    </Text>
  </View>
)
