import { defaultStyles } from "@/styles"
import { Stack } from "expo-router"
import { View } from "react-native"

const SettingsScreenLayout = () => {
    return (<View style={defaultStyles.container}> 
            <Stack>
                <Stack.Screen name="index" options={{
                    headerShown: false,
                }}/>
            </Stack>
        </View>)
}

export default SettingsScreenLayout