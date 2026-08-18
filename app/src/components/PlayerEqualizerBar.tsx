import {colors} from "@/constants";
import {Entypo, SimpleLineIcons} from "@expo/vector-icons";
import React, {ComponentProps} from "react";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {View} from "react-native";

type IconProps = Omit<ComponentProps<typeof SimpleLineIcons>,
  'name'>
const PlayerEqualizerBar = ({ ...iconProps }: IconProps) => {
  const {top, right} = useSafeAreaInsets()
  const handleEqualizer = () => {
    console.log('Equalizer')
  }
  return (
      <SimpleLineIcons name={"equalizer"} color={colors.icon} onPress={handleEqualizer} {...iconProps} />
  )
}

export default PlayerEqualizerBar
