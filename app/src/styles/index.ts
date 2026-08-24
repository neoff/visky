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

  screenContainer: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flex: 1,
    justifyContent: 'center',
  },
  stretch: {
    alignSelf: 'stretch',
  },
  stretchContainer: {
    alignSelf: 'stretch',
    flex: 1,
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
    marginVertical: 10 + modifiers.padding,
    marginLeft: 50 + 14 + modifiers.margin, // artwork width + columnGap: the separator starts at the text
  },
  emptyContentText: {
    ...defaultStyles.text,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 20 + modifiers.padding,
  },
  emptyContentImage: {
    width: 200,
    height: 200,
    alignSelf: 'center',
    marginTop: 40 + modifiers.padding,
    opacity: 0.3,
  },
})

export const trackListStyles = StyleSheet.create({
  // The row itself adds NO horizontal padding: the screen already applies
  // `screenPadding.horizontal` on both sides, so the artwork and the "..." menu
  // end up the same distance from their edges.
  trackItemContainer: {
    flexDirection: 'row',
    columnGap: 14 + modifiers.padding,
    alignItems: 'center',
    paddingRight: 0,
  },
  // artwork + centred play/loading overlay. The overlay is an absolute fill of
  // the container, so the icon stays centred whatever the artwork size is.
  trackArtworkContainer: {
    width: 50 + modifiers.image,
    height: 50 + modifiers.image,
  },
  trackArtworkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackArtworkImage: {
    borderRadius: 8,
    width: '100%',
    height: '100%',
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
    fontSize: 14 + modifiers.text,
    marginTop: 4  + modifiers.padding,
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
    flexGrow: 1,
    fontSize: fonts.base,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  header: {
    fontSize: fonts.lg,
    fontWeight: '700',
    textAlign: 'center',
    color: '#fff',
    margin: 10,
  },
  // the long blurb under the header: deliberately a step smaller than the body
  // text so the header keeps the weight
  intro: {
    textAlign: 'center',
    fontSize: fonts.xs,
    lineHeight: fonts.xs + 6,
    color: '#bdbdbd',
    marginBottom: 24,
  },
  // the logo is a transparent-cornered PNG, so it needs its own white plate.
  // Round, and the artwork fills 96% of it so the arms of the X almost reach the
  // border instead of floating in white.
  logoPlate: {
    // a quarter smaller again — just over the 100pt person icon it replaced
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 24,
  },
  logoImage: {
    width: 108,
    height: 108,
  },
  quote: {
    alignSelf: 'stretch',
    textAlign: 'right',
    fontStyle: 'italic',
    fontSize: fonts.xs + 1,
    lineHeight: fonts.xs + 8,
    color: '#d0d0d0',
    marginBottom: 28,
  },
  text: {
    textAlign: 'center',
    fontSize: fonts.xs + 2,
    lineHeight: fonts.xs + 9,
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
