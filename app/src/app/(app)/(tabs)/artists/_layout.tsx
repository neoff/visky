import { defaultStyles } from "@/styles"
import { Stack } from "expo-router"
import { View } from "react-native"

const ArtistScreenLayout = () => {
    return (<View style={defaultStyles.container}>
            <Stack>
                <Stack.Screen name="index" options={{
                    headerShown: false,
                }}/>
                {/* one DJ's shows; the screen draws its own bar, with the name
                    it was pushed with */}
                <Stack.Screen name="[key]" options={{
                    headerShown: false,
                }}/>
            </Stack>
        </View>)
}

export default ArtistScreenLayout
