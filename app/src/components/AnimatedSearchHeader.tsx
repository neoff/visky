// AnimatedSearchHeader.tsx
import {TextInput, View, Text, Platform, Pressable, StyleSheet, TouchableOpacity} from 'react-native';
import Animated, {
  Extrapolation,
  SharedValue,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Ionicons';
import {colors, fonts, layout} from "@/constants";
import {Ionicons} from "@expo/vector-icons";
import {useCallback, useRef, useState} from "react";
import {useSafeAreaInsets} from "react-native-safe-area-context";

interface AnimatedSearchHeaderProps {
  title: string;
  placeholder?: string;
  onSearchChange?: (text: string) => void;
  scrollY?: SharedValue<number>;
  /** optional control shown to the RIGHT of the search box (e.g. a filter) */
  action?: React.ReactNode;
}

export const AnimatedSearchHeader: React.FC<AnimatedSearchHeaderProps> = ({
                                                                            title,
                                                                            placeholder,
                                                                            onSearchChange,
                                                                            scrollY: externalScrollY,
                                                                            action,
                                                                          }) => {
  const localScrollY = useSharedValue(0);
  const scrollY = externalScrollY ?? localScrollY;
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
    height: interpolate(scrollY.value, [0, 40], [layout.searchBoxHeight, 0], Extrapolation.CLAMP),
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
    // translucent rgba plate instead of BlurView: expo-blur is translucent to a
    // different degree on Android, which made the two headers look unequal
    <View style={[styles.header, {paddingTop: insets.top + 8}]}>
      <Animated.View style={[{alignItems: 'flex-start'}, headerAnimatedStyle]}>
        <Text style={styles.title}>{title}</Text>
      </Animated.View>

      <Animated.View style={[searchAnimatedStyle, styles.searchRow]}>
        <View style={[styles.searchBox, {flex: 1}]} >
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
        {action}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // paddingTop is applied at runtime from the top safe-area inset
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.surfaceHeader,
    zIndex: 10,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: 12,
    includeFontPadding: false,
  },
  // the search box and the optional action share one row; the box takes the
  // spare width so the action keeps its natural size
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: layout.searchBoxHeight,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    gap: 8,
  },
  // NO vertical padding here: the box already has a fixed height and Android
  // clips the input to `height - padding`, which cut the text row in half.
  // `height: '100%'` + centred text keeps the caret and the glyphs whole.
  input: {
    height: '100%',
    color: colors.text,
    paddingVertical: 0,
    paddingHorizontal: 4,
    fontSize: fonts.sm,
    textAlignVertical: 'center',
    includeFontPadding: false,
    flex: 1,
  },
});
