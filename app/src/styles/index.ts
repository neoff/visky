import {colors, fonts, modifiers, screenPadding, size} from '@/constants'
import {StyleSheet} from 'react-native'

export const defaultStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  text: {
    fontSize: fonts.base,
    color: colors.text,
  },
})

export const utilsStyles = StyleSheet.create({
  centeredRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slider: {
    height: 7,
    borderRadius: 16,
  },
  itemSeparator: {
    borderColor: colors.textMuted,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.3,
  },
  emptyContentText: {
    ...defaultStyles.text,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },
  emptyContentImage: {
    width: 200,
    height: 200,
    alignSelf: 'center',
    marginTop: 40,
    opacity: 0.3,
  },
})

export const trackListStyles = StyleSheet.create({
  trackItemContainer: {
    flexDirection: 'row',
    columnGap: 14,
    alignItems: 'center',
    paddingRight: 20,
  },
  trackPlayingIconIndicator: {
    position: 'absolute',
    top: 18,
    left: 16,
    width: 16,
    height: 16,
  },
  trackPausedIndicator: {
    position: 'absolute',
    top: 14,
    left: 14,
  },
  trackArtworkImage: {
    borderRadius: 8,
    width: 50,
    height: 50,
  },
  trackTitleText: {
    ...defaultStyles.text,
    fontSize: fonts.sm,
    fontWeight: '600',
    maxWidth: '90%',
  },
  trackArtistText: {
    ...defaultStyles.text,
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
})
export const progressBarStyles = StyleSheet.create({
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 20,
  },
  timeText: {
    ...defaultStyles.text,
    color: colors.text,
    opacity: 0.75,
    fontSize: fonts.xs,
    letterSpacing: 0.7,
    fontWeight: '500',
  },
})
export const playerControlStyle = StyleSheet.create({
  container: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
})

export const iconStyles = {
  borderRadius: 10 + modifiers.padding,
  paddingHorizontal: 10 + modifiers.padding,
  iconStyle: {
    paddingVertical: 5 + modifiers.padding,
  },
}
export const welcomeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    fontSize: fonts.base,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    fontSize: fonts.lg,
    textAlign: 'center',
    color: '#fff',
    margin: 10,
  },
  text: {
    textAlign: 'center',
    fontSize: fonts.sm,
    color: '#ddd',
    marginBottom: 5 + modifiers.padding,
  },
  avatar: {
    margin: 20 + modifiers.padding,
  },
  avatarImage: {
    borderRadius: 50 + modifiers.padding,
    height: 200 + size.image,
    width: 200 + size.image,
  },
  buttons: {
    justifyContent: 'space-between',
    flexDirection: 'column',
    margin: 20 + modifiers.padding,
    marginBottom: 30 + modifiers.padding,
  },
  login_button: {
    margin: 10 + modifiers.padding,
    fontSize: fonts.lg,
  },
})

export const playerStyle = StyleSheet.create({
  overlayContainer: {
    ...defaultStyles.container,
    paddingHorizontal: screenPadding.horizontal,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  artworkImageContainer: {
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.44,
    shadowRadius: 11.0,
    flexDirection: 'row',
    justifyContent: 'center',
    height: '45%',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    borderRadius: 12,
  },
  trackTitleContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  trackTitleText: {
    ...defaultStyles.text,
    fontSize: 22,
    fontWeight: '700',
  },
  trackArtistText: {
    ...defaultStyles.text,
    fontSize: fonts.base,
    opacity: 0.8,
    maxWidth: '90%',
  },
})
