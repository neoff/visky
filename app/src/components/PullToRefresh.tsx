import React from 'react'
import {SharedValue} from 'react-native-reanimated'

export type PullToRefreshProps = {
  /** the list's scroll offset, so the pull only counts AT THE TOP */
  scrollY?: SharedValue<number>
  onRefresh: () => void
  refreshing?: boolean
  /** where the indicator hangs from — the header covers the top of the list */
  topOffset?: number
  children: React.ReactNode
}

/**
 * Pull-to-refresh for the platforms that do not have it.
 *
 * On iOS and Android the gesture is the list's own `RefreshControl`, so this is
 * a pass-through. The web and desktop builds get the real implementation — see
 * PullToRefresh.web.tsx.
 */
export const PullToRefresh = ({children}: PullToRefreshProps) => <>{children}</>
