// AnimatedSearchHeader.tsx
import {TextInput, View, Text, Platform, Pressable, StyleSheet, TouchableOpacity} from 'react-native';
import {BlurView} from 'expo-blur';
import Animated, {
  Extrapolation,
  SharedValue,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Ionicons';
import {colors} from "@/constants";
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
  const insets = useSafeAreaInsets();
  const [searchText, setSearchText] = useState('');
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<TextInput>(null)

  const headerAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(scrollY.value, [0, 80], [0, -20], Extrapolation.CLAMP);
    const scale = interpolate(scrollY.value, [0, 80], [1, 0.75], Extrapolation.CLAMP);
    const translateX = interpolate(scrollY.value, [0, 80], [0, -20], Extrapolation.CLAMP);

    return {
      transform: [{translateY}, {translateX}, {scale}],
    };
  });

  const searchAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 40], [1, 0], Extrapolation.CLAMP),
    height: interpolate(scrollY.value, [0, 40], [48, 0], Extrapolation.CLAMP),
    marginTop: interpolate(scrollY.value, [0, 40], [12, 0], Extrapolation.CLAMP),
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
    <BlurView
      intensity={95}
      tint={'dark'}
      experimentalBlurMethod={'dimezisBlurView'}
      style={styles.header}
    >
      <Animated.View style={[{alignItems: 'flex-start'}, headerAnimatedStyle]}>
        <Text style={styles.title}>{title}</Text>
      </Animated.View>

      <Animated.View style={[searchAnimatedStyle]}>
        <View style={styles.searchBox} >
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
    </BlurView>
  );
};

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 10,

  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
    gap: 8,
  },
  input: {
    backgroundColor: colors.background,
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    fontSize: 16,
    flex: 1,
  },
});