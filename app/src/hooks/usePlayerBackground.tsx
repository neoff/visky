import {useEffect, useState} from "react";
import {AndroidImageColors, IOSImageColors, WebImageColors} from "react-native-image-colors/build/types";
import {getColors} from "react-native-image-colors";
import {colors} from "@/constants";
import {Platform} from "react-native";


export const usePlayerBackground = (imageUrl: string) => {
  const [imageColors, setImageColors] = useState<IOSImageColors | AndroidImageColors | WebImageColors | null>(null)

  useEffect(() => {
    getColors(imageUrl, {
      fallback: colors.background,
      cache: true,
      key: imageUrl,
    }).then((colors) => {
        const clrs = Platform.OS === 'web' ? colors as WebImageColors: Platform.OS === 'android' ? colors as AndroidImageColors : colors as IOSImageColors
      setImageColors(clrs)
      }
    )
  }, [imageUrl])

  return { imageColors }
}