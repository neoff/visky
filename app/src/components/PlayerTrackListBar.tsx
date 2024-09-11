import {colors} from "@/constants";
import {MaterialCommunityIcons, Octicons} from "@expo/vector-icons";
import React, {ComponentProps} from "react";
import {View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";

type IconProps = Omit<ComponentProps<typeof MaterialCommunityIcons>, 'name'>
const PlayerTrackListBar = ({...iconProps}: IconProps) => {
  const {bottom, left} = useSafeAreaInsets()
  const isHaveTrackList = false
  const handleTrackList = () => {
    console.log('Track List')
  }
  return (
      <MaterialCommunityIcons
        name={
          isHaveTrackList?"playlist-music":"playlist-remove"
      }
        color={colors.icon}
        style={{marginBottom: 0, marginTop: -4, marginRight: -4,
          opacity: isHaveTrackList? 1.0 :0.3,
        }}
        onPress={handleTrackList} {...iconProps} />
  )
}

export default PlayerTrackListBar
