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
                }}/>
            </Stack>
        </View>)
}

export default SettingsScreenLayout