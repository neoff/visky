// AnimatedSearchHeader.tsx
import {
  TextInput,
  View,
  Text,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  LayoutChangeEvent
} from 'react-native';
import {BlurView} from 'expo-blur';
import Animated, {
  Extrapolation,
  SharedValue,
  interpolate,
  useAnimatedStyle,
  useSharedValue, runOnUI,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Ionicons';
import {colors, modifiers} from "@/constants";
import {Ionicons} from "@expo/vector-icons";
import {useCallback, useRef, useState} from "react";
import {useSafeAreaInsets} from "react-native-safe-area-context";

interface AnimatedSearchHeaderProps {
  title: string;
  placeholder?: string;
  onSearchChange?: (text: string) => void;
  scrollY: SharedValue<number>;
}


export const AnimatedSearchHeader: React.FC<AnimatedSearchHeaderProps> = ({
                                                                            title,
                                                                            placeholder,
                                                                            onSearchChange,
                                                                            scrollY,
                                                                          }) => {


  const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
  const insets = useSafeAreaInsets();
  const [searchText, setSearchText] = useState('');
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<TextInput>(null)
  const [titleWidth, setTitleWidth] = useState(0);

  const handleTitleLayout = (event: LayoutChangeEvent) => {
    const {width} = event.nativeEvent.layout;
    setTitleWidth(width);
  };
  const screenWidth = Dimensions.get('window').width - insets.left - insets.right;

  const header = {
    paddingTop: insets.top + 1 + modifiers.padding,
    paddingBottom: 12 + modifiers.padding
  }
  const titleBox = {
    marginBottom: 12 + modifiers.margin,
  }
  const searchBox = {
    height: 48 + modifiers.height,
  }
  const paddingWidth = styles.header.paddingHorizontal;
  const headerHeight = header.paddingTop
    + header.paddingBottom
    + styles.title.fontSize
    + titleBox.marginBottom
    + searchBox.height
    + styles.searchBox.paddingVertical
    + styles.input.paddingVertical;
  const headerHeightSmall = header.paddingTop
    + header.paddingBottom
    + styles.input.paddingVertical;
  //insets.top +
  //ANIMATION
  const headerAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollY.value, [0, 80], [1, 0.50], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [0, 80], [0, -15], Extrapolation.CLAMP);
    const centerOffsetX = (screenWidth - titleWidth * scale) / 4 - paddingWidth;
    const translateX = interpolate(scrollY.value, [0, 80], [0, centerOffsetX], Extrapolation.CLAMP);

    return {
      transform: [{translateY}, {translateX}, {scale}],
      marginBottom: interpolate(scrollY.value, [0, 30], [titleBox.marginBottom, 0], Extrapolation.CLAMP),
    };
  });

  const containerAnimatedStyle = useAnimatedStyle(() => {
    return {
      height: interpolate(scrollY.value, [0, 80], [headerHeight, headerHeightSmall], Extrapolation.CLAMP),
      paddingTop: interpolate(scrollY.value, [0, 80], [header.paddingTop, insets.top], Extrapolation.CLAMP),
      paddingHorizontal: styles.header.paddingHorizontal,
      paddingBottom: interpolate(scrollY.value, [0, 80], [header.paddingBottom, 0], Extrapolation.CLAMP),
    };

  });
  const searchAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 30], [1, 0], Extrapolation.CLAMP),
    height: interpolate(scrollY.value, [0, 30], [searchBox.height, 0], Extrapolation.CLAMP),
    marginBottom: interpolate(scrollY.value, [0, 30], [titleBox.marginBottom, 0], Extrapolation.CLAMP),
  }));

  const handleChangeText = useCallback(
    (text: string) => {
      setSearchText(text);
      onSearchChange?.(text);
    },
    [onSearchChange]
  );

  const clearInput = () => {
    setSearchText('');
    onSearchChange?.('');
  };

  return (
    <AnimatedBlurView
      intensity={95}
      tint={'dark'}
      experimentalBlurMethod={'dimezisBlurView'}
      style={[{
        ...styles.header,
      },containerAnimatedStyle]}
    >
      <Animated.View style={[{alignItems: 'flex-start'}, headerAnimatedStyle]}>
        <Text style={styles.title} onLayout={handleTitleLayout}>{title}</Text>
      </Animated.View>

      <Animated.View style={[searchAnimatedStyle]}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={colors.textMutedDarker}/>
          <TextInput
            placeholder={placeholder || 'Search'}
            value={searchText}
            placeholderTextColor="#888"
            style={styles.input}
            onChangeText={handleChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={clearInput}>
              <Icon name="close-circle" size={20} color={colors.text}/>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </AnimatedBlurView>
  );
};

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 16 + modifiers.padding
  },
  title: {
    fontSize: 32 + modifiers.text,
    fontWeight: "bold",
    color: colors.text,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
    gap: 8,
  },
  input: {
    backgroundColor: colors.background,
    color: colors.text,
    paddingHorizontal: 16 + modifiers.padding,
    paddingVertical: 10,
    borderRadius: 12,
    fontSize: 16 + modifiers.text,
    flex: 1,
  },
});