import Constants from 'expo-constants'
import {requireOptionalNativeModule} from 'expo-modules-core'
import {Platform} from 'react-native'
import {playbackSync} from '@/services/playbackSync'

/**
 * The doorbell.
 *
 * The backend rings a DATA-ONLY push at a device whose socket has died, so the
 * app wakes up, reconnects and pulls the session state itself. The push carries
 * no state and starts no audio — it cannot:
 *
 *   * iOS never wakes an app the user force-quit, and forbids starting audio
 *     from a background notification;
 *   * Apple throttles background pushes to a handful per hour and may drop them;
 *   * delivery is unordered and can lag by seconds.
 *
 * Everything that must be correct — which track, which second, who owns the
 * sound — travels over the socket. This only shortens the wait for it.
 *
 * The two native modules are loaded LAZILY and defensively: an installed build
 * that predates them (or an OTA update landing on one) must keep playing music,
 * it just cannot be woken. Everything here degrades to "no push token", which
 * the picker already handles by greying the device out once its socket dies.
 */

const WAKE_TASK = 'visky-playback-wake'

type NotificationsModule = typeof import('expo-notifications')
type TaskManagerModule = typeof import('expo-task-manager')

let notifications: NotificationsModule | null | undefined
let taskManager: TaskManagerModule | null | undefined

/**
 * Ask the native runtime FIRST.
 *
 * Requiring expo-notifications on a binary that does not contain it throws
 * ("Cannot find native module 'ExpoPushTokenManager'") from inside the module's
 * own initialisation — which a try/catch around the require does not reliably
 * contain, and which shows up as a red box in development. Probing for the
 * native module is cheap and never throws, so the JS module is only ever
 * required on a build that can actually serve it.
 */
const hasNativePush = (): boolean =>
  Boolean(requireOptionalNativeModule('ExpoPushTokenManager'))

const loadNotifications = (): NotificationsModule | null => {
  if (notifications !== undefined) return notifications
  if (!hasNativePush()) {
    console.log('==push: this build has no notification module — no wake-ups')
    notifications = null
    return notifications
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    notifications = require('expo-notifications') as NotificationsModule
  } catch (error) {
    console.warn('==push: expo-notifications failed to load — no wake-ups', error)
    notifications = null
  }
  return notifications
}

const loadTaskManager = (): TaskManagerModule | null => {
  if (taskManager !== undefined) return taskManager
  if (!requireOptionalNativeModule('ExpoTaskManager')) {
    taskManager = null
    return taskManager
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    taskManager = require('expo-task-manager') as TaskManagerModule
  } catch {
    taskManager = null
  }
  return taskManager
}

let configured = false

/** Silence the wake-up (it is not a message for the user) and define its task. */
const configure = (): void => {
  if (configured) return
  configured = true

  const Notifications = loadNotifications()
  if (!Notifications) return

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as {kind?: string} | undefined
      if (data?.kind === 'playback-wake') {
        playbackSync.wake()
        return {
          shouldShowBanner: false,
          shouldShowList: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }
      }
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }
    },
  })

  // Delivered while the app is backgrounded but still alive: reconnect at once,
  // so the transfer that triggered this lands a moment later over the socket.
  const TaskManager = loadTaskManager()
  try {
    TaskManager?.defineTask(WAKE_TASK, async ({data, error}) => {
      if (error) {
        console.warn('==push: wake task failed', error)
        return
      }
      console.log('==push: woken', JSON.stringify(data)?.slice(0, 120))
      playbackSync.wake()
    })
  } catch (error) {
    console.warn('==push: could not define the wake task', error)
  }
}

let registered = false

/**
 * Ask for a push token. Returns null when the user says no, when the native
 * module is missing, when there are no FCM/APNs credentials, or on a simulator
 * — all survivable: the device simply cannot be woken.
 */
export const registerForWakePush = async (): Promise<string | null> => {
  configure()
  const Notifications = loadNotifications()
  if (!Notifications) return null

  try {
    if (Platform.OS === 'android') {
      // a channel is required before any notification can be delivered
      await Notifications.setNotificationChannelAsync('playback', {
        name: 'Playback',
        importance: Notifications.AndroidImportance.LOW,
        showBadge: false,
      })
    }

    const existing = await Notifications.getPermissionsAsync()
    const granted = existing.granted || (await Notifications.requestPermissionsAsync()).granted
    if (!granted) {
      console.log('==push: no permission — this device cannot be woken')
      return null
    }

    if (!registered && loadTaskManager()) {
      await Notifications.registerTaskAsync(WAKE_TASK)
      registered = true
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
    const token = await Notifications.getExpoPushTokenAsync(projectId ? {projectId} : undefined)
    console.log('==push: wake token acquired')
    return token.data
  } catch (error) {
    console.warn('==push: could not register for wake-ups', error)
    return null
  }
}

/** A wake-up that arrived while the app was in the foreground. */
export const listenForWakePush = (): {remove: () => void} => {
  configure()
  const Notifications = loadNotifications()
  if (!Notifications) return {remove: () => undefined}
  try {
    return Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as {kind?: string} | undefined
      if (data?.kind === 'playback-wake') playbackSync.wake()
    })
  } catch (error) {
    console.warn('==push: could not listen for wake-ups', error)
    return {remove: () => undefined}
  }
}
