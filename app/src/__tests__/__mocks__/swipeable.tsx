/**
 * ReanimatedSwipeable, reduced to the two things a test needs: the row itself,
 * and the actions hidden under it.
 *
 * The real one is a gesture driving a reanimated transform — nothing a node
 * test can drive. The render props are kept on the rendered node instead, so a
 * test can ask "what does a swipe in this direction offer", and `close()` is
 * recorded so a row that closes itself can be checked.
 */
import React from 'react'

export type SwipeableMethods = {close: () => void}

export const __closes: string[] = []

const ReanimatedSwipeable = React.forwardRef(({children, ...props}: any, ref: any) => {
  React.useImperativeHandle(ref, () => ({
    close: () => __closes.push('close'),
    openLeft: () => undefined,
    openRight: () => undefined,
    reset: () => undefined,
  }))
  return React.createElement('Swipeable', props, children)
})
ReanimatedSwipeable.displayName = 'ReanimatedSwipeable'

export default ReanimatedSwipeable
