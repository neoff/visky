import {StackScreenWithSearchBar} from "@/constants/layout"
import {defaultStyles} from "@/styles"
import {Stack} from "expo-router"
import {Text, View} from "react-native"
import {colors} from "@/constants";
import _ from "lodash";
const SongsScreenLayout = () => {
  console.log("===SongsScreenLayout");
  return (
    <View style={defaultStyles.container}>
      <Stack>
        <Stack.Screen name="index" options={{
          ...StackScreenWithSearchBar,
          headerTitle: 'Songs',
        }}/>
      </Stack>
    </View>
  )
}

export default SongsScreenLayout