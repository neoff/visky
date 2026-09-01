const {withAppDelegate, withInfoPlist} = require('@expo/config-plugins')

/**
 * Turns the phone app into a CarPlay audio app.
 *
 * Two things are needed and neither is optional.
 *
 * THE ENTITLEMENT lives in `app.json` under `ios.entitlements`, NOT here. Every
 * other entitlement in this project is declared there (see milestone 04 for
 * MusicKit), and two places to look is how one of them ends up stale.
 * `com.apple.developer.carplay-audio` is not self-serve either way: Apple
 * grants it per App ID on request, and it only lands in a provisioning profile
 * GENERATED AFTER the grant. An older profile — including one EAS has cached —
 * silently lacks it, and the build then fails to sign or the app simply never
 * appears on the CarPlay dashboard. After changing it, the profile has to be
 * regenerated (`eas credentials`), not just reused.
 *
 * THE SCENE MANIFEST stays here, because it is the half that needs the comment
 * below and JSON has nowhere to put one.
 *
 * CarPlay is a second UIScene, so the app has to declare one — and the moment
 * ANY scene manifest exists with `UIApplicationSupportsMultipleScenes` true,
 * UIKit switches the whole app to the scene lifecycle. That is not optional and
 * not negotiable, and it is where this plugin first went wrong.
 *
 * THE PHONE SCENE IS DECLARED TOO, and it has to be. Expo's generated
 * AppDelegate builds its window the pre-scene way:
 *
 *     window = UIWindow(frame: UIScreen.main.bounds)
 *     factory.startReactNative(withModuleName: "main", in: window, ...)
 *
 * That window has no `windowScene`, so under the scene lifecycle it is never
 * attached to anything and never appears. An earlier version of this plugin
 * declared ONLY the CarPlay role on the theory that the phone would stay on the
 * legacy path. It does not. The app launched, JS ran, the network ran, audio
 * played — and the screen stayed black, on every build, on every iOS version.
 *
 * The evidence that was taken for "the phone still works" was the notification
 * permission dialog appearing. That proves nothing: system alerts are presented
 * by SpringBoard in its own window and show up whether or not the app has one.
 *
 * So `ViskyPhoneSceneDelegate` below adopts the AppDelegate's window into the
 * connecting `UIWindowScene`. It is appended to AppDelegate.swift rather than
 * living in the Car pod because it needs `RCTLinkingManager`, which the app
 * target already links.
 *
 * The delegate is named by its Objective-C symbol, not by
 * `$(PRODUCT_MODULE_NAME).Class`. The class lives in the Car pod, not in
 * the app target, so the `$(PRODUCT_MODULE_NAME)` substitution would resolve
 * to the wrong module. `@objc(ViskyCarPlaySceneDelegate)` on the Swift class
 * gives the runtime a flat name that is found from anywhere.
 */

/** Must match the @objc name on the Swift class in modules/car. */
const SCENE_DELEGATE = 'ViskyCarPlaySceneDelegate'
/** Must match the @objc name on the class appended to AppDelegate.swift below. */
const PHONE_SCENE_DELEGATE = 'ViskyPhoneSceneDelegate'
const CARPLAY_ROLE = 'CPTemplateApplicationSceneSessionRoleApplication'
const PHONE_ROLE = 'UIWindowSceneSessionRoleApplication'

const withCarPlayScene = (config) =>
  withInfoPlist(config, (config) => {
    const manifest = config.modResults.UIApplicationSceneManifest ?? {}
    const configurations = manifest.UISceneConfigurations ?? {}

    config.modResults.UIApplicationSceneManifest = {
      ...manifest,
      UIApplicationSupportsMultipleScenes: true,
      UISceneConfigurations: {
        ...configurations,
        [PHONE_ROLE]: [
          {
            UISceneClassName: 'UIWindowScene',
            UISceneConfigurationName: 'Phone',
            UISceneDelegateClassName: PHONE_SCENE_DELEGATE,
          },
        ],
        [CARPLAY_ROLE]: [
          {
            UISceneClassName: 'CPTemplateApplicationScene',
            UISceneConfigurationName: 'CarPlay',
            UISceneDelegateClassName: SCENE_DELEGATE,
          },
        ],
      },
    }

    return config
  })

/**
 * The phone's scene delegate, appended to the generated AppDelegate.swift.
 *
 * It lives here rather than in the Car pod for one reason: it forwards deep
 * links to `RCTLinkingManager`, and under the scene lifecycle those callbacks
 * move OFF the app delegate and onto the scene delegate. Miss them and
 * `visky://` stops working — which is the whole auth handover between the
 * phone and the web player.
 */
const PHONE_SCENE_CLASS = `
// MARK: - CarPlay

/**
 Hands the AppDelegate's window to the phone's UIWindowScene.

 Declaring a UIApplicationSceneManifest for CarPlay (plugins/withCarPlay.js)
 puts the ENTIRE app on the scene lifecycle, phone included. The window built
 above in \`didFinishLaunchingWithOptions\` has no \`windowScene\`, so UIKit never
 shows it: the app runs, JS runs, audio plays, and the screen is black. Adopting
 that same window here — rather than building a second one — keeps the React
 root view controller the AppDelegate already installed.

 The link callbacks are here for the same reason. Under the scene lifecycle
 \`application(_:open:options:)\` is no longer called, so the forwarding in
 AppDelegate above is dead code on iOS 13+ and this is what keeps \`visky://\`
 alive.
 */
@objc(ViskyPhoneSceneDelegate)
class ViskyPhoneSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }

    // The AppDelegate has already finished launching by the time a scene
    // connects, so its window exists and already holds React's root view
    // controller. Take it rather than making a second one.
    let existing = (UIApplication.shared.delegate as? AppDelegate)?.window
    let window = existing ?? UIWindow(windowScene: windowScene)
    window.windowScene = windowScene
    self.window = window
    window.makeKeyAndVisible()

    // A cold start from a link delivers it here, not through the app delegate.
    for context in connectionOptions.urlContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
    if let activity = connectionOptions.userActivities.first {
      RCTLinkingManager.application(
        UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(
      UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`

const withPhoneSceneDelegate = (config) =>
  withAppDelegate(config, (config) => {
    if (config.modResults.contents.includes('ViskyPhoneSceneDelegate')) return config

    if (!config.modResults.contents.includes('class AppDelegate: ExpoAppDelegate')) {
      throw new Error(
        'withCarPlay: AppDelegate.swift is not the shape this plugin patches. ' +
          'The phone scene delegate must still be added, or the app launches to a black screen.',
      )
    }

    config.modResults.contents = `${config.modResults.contents.trimEnd()}\n${PHONE_SCENE_CLASS}`
    return config
  })

module.exports = (config) => withPhoneSceneDelegate(withCarPlayScene(config))
