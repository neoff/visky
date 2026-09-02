import React, {PropsWithChildren} from 'react'

/**
 * Pull the screen down to close it.
 *
 * Native gets this from the navigator itself — the `player` route is declared
 * with `gestureEnabled` and `gestureDirection: 'vertical'` in
 * app/(app)/_layout.tsx — so here it is a plain passthrough and adds no handler
 * to compete with the stack's own. The desktop build needs a real one; see
 * SwipeToDismiss.web.tsx.
 */
export const SwipeToDismiss = ({children}: PropsWithChildren<{onDismiss: () => void}>) => (
  <>{children}</>
)
