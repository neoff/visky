import { colors } from "@/constants"
import { defaultStyles } from "@/styles"
import { Stack } from "expo-router"
import { View } from "react-native"

const SettingsScreenLayout = () => {
    return (<View style={defaultStyles.container}> 
            <Stack>
                <Stack.Screen name="index" options={{
                    headerShown: false,
                }}/>
                <Stack.Screen name="devices" options={{
                    title: "Devices",
                    headerStyle: {backgroundColor: colors.background},
                    headerTintColor: colors.text,
                    // Chevron only. The back button labels itself with the
                    // PREVIOUS screen's title, and the settings root has none —
                    // it renders with headerShown: false — so react-navigation
                    // fell back to the route name and the button read "< index".
                    // Giving the root a title would fix the label and show it
                    // nowhere else, which is a setting that exists only to feed
                    // another screen; asking for the chevron is the direct way
                    // to say what we want. iOS and web only, and Android never
                    // draws a back title anyway.
                    headerBackButtonDisplayMode: "minimal",
                }}/>
            </Stack>
        </View>)
}

export default SettingsScreenLayout