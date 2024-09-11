import {colors} from "@/constants";
import {Entypo, MaterialCommunityIcons, MaterialIcons, SimpleLineIcons} from "@expo/vector-icons";
import React, {ComponentProps} from "react";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {TouchableOpacity, View} from "react-native";

type IconProps = Omit<ComponentProps<typeof MaterialCommunityIcons>,
  'name'>
const PlayerEditInfoBar = ({...iconProps}: IconProps) => {
  const {top, right} = useSafeAreaInsets()
  const handleSongInfo = () => {
    console.log('Song Info')
  }
  return (
    <View>
      <Entypo name="dots-three-horizontal" size={28} color={colors.icon} onPress={handleSongInfo} {...iconProps}/>
    </View>
  )
}

export default PlayerEditInfoBar
