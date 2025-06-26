import {PlayListItem} from '@/components/PlayListItem'
import {unknownTrackImageUri} from '@/constants/images'
import {playlistNameFilter} from '@/helpers/filter'
import {Playlist} from '@/helpers/types'
import {useNavigationSearch} from '@/hooks/useNavigationSearch'
import {utilsStyles} from '@/styles'
import {useMemo} from 'react'
import {Text, View} from 'react-native'
import { Image } from 'expo-image';
import {FlashList, FlashListProps} from "@shopify/flash-list";

type PlayListProps = {
  playlists: Playlist[]
  onPlaylistPress: (playlist: Playlist) => void
} & Partial<FlashListProps<Playlist>>

const ItemDivider = () => (
  <View style={{...utilsStyles.itemSeparator, marginLeft: 80, marginVertical: 12}}/>
)

export const PlayList = ({
                           playlists,
                           onPlaylistPress: handlePlaylistPress,
                           ...flatListProps
                         }: PlayListProps) => {
  const search = useNavigationSearch({
    searchBarOptions: {
      placeholder: 'Find in playlist',
    },
  })

  const filteredPlaylist = useMemo(() => {
    return playlists.filter(playlistNameFilter(search))
  }, [playlists, search])

  return (
    <FlashList
      estimatedItemSize={playlists.length}
      contentContainerStyle={{paddingTop: 10, paddingBottom: 128}}
      ItemSeparatorComponent={ItemDivider}
      ListFooterComponent={ItemDivider}
      ListEmptyComponent={
        <View>
          <Text style={utilsStyles.emptyContentText}>No playlist found</Text>
          <Image
            source={unknownTrackImageUri}
            style={utilsStyles.emptyContentImage}
            contentFit="cover"
            transition={300}
          />
        </View>
      }
      data={filteredPlaylist}
      renderItem={({item: playlist}) => (
        <PlayListItem playlist={playlist} onPress={() => handlePlaylistPress(playlist)}/>
      )}
      {...flatListProps}
    />
  )
}
