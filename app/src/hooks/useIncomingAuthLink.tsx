import {useEffect, useState} from 'react'
import {Platform} from 'react-native'
import {useSession} from '@/components/SessionProvider'
import {parseAuthPayload} from '@/helpers/authTransfer'

export type HandoffState = 'idle' | 'accepted' | 'rejected'

/**
 * Signs in from credentials sitting in the page's fragment — the other half of
 * the copy button: mail the link to yourself, open it on the laptop, done.
 *
 * The fragment is stripped the moment it is read, parsed or not. It never
 * reached a server (browsers do not send fragments), but leaving it in the
 * address bar puts the account in the history, in a screenshot, and in whatever
 * the next person to use the machine presses Ctrl-L on.
 */
export const useIncomingAuthLink = (): HandoffState => {
  const {signIn} = useSession()
  const [state, setState] = useState<HandoffState>('idle')

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return

    const fragment = window.location?.hash ?? ''
    if (!fragment.includes('access_token=')) return

    const session = parseAuthPayload(fragment)
    window.history.replaceState(null, '', window.location.pathname + window.location.search)

    if (!session) {
      console.warn('==pair: the link carried no usable session')
      setState('rejected')
      return
    }
    console.log('==pair: signing in from the link')
    signIn(session)
    setState('accepted')
  }, [])

  return state
}
