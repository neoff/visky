/** @expo/vector-icons — a host element carrying the glyph name. */
import React from 'react'

const iconSet = (family: string) => {
  const Icon = (props: any) => React.createElement(family, props)
  Icon.displayName = family
  return Icon
}

export const Ionicons = iconSet('Ionicons')
export const MaterialIcons = iconSet('MaterialIcons')
export const MaterialCommunityIcons = iconSet('MaterialCommunityIcons')
export const FontAwesome = iconSet('FontAwesome')
export const AntDesign = iconSet('AntDesign')
export const Entypo = iconSet('Entypo')
export const Feather = iconSet('Feather')
