/**
 * react-native-fast-image, which is a native view.
 *
 * Renders as itself so a test can read the `source` a row was given.
 */
import React from 'react'

const FastImage = (props: any) => React.createElement('FastImage', props, props.children)
FastImage.priority = {low: 'low', normal: 'normal', high: 'high'}
FastImage.resizeMode = {contain: 'contain', cover: 'cover', stretch: 'stretch', center: 'center'}

export default FastImage
