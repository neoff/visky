package expo.modules.car

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JS-facing half of the car integration on Android.
 *
 * A thin shell over [CarLink], for the same reason the iOS module is: this
 * object dies with the JS runtime while the browser service the head unit talks
 * to does not.
 *
 * It publishes no now-playing state. Title, artwork, duration and the transport
 * buttons all come from the MediaSession react-native-track-player already
 * owns — see CarBrowserService, which hands Android Auto that very session
 * rather than starting a second one.
 */
class CarModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Car")

    Events("onCarCommand", "onCarStatus")

    OnCreate {
      // The tree is written to disk on every publish, and this is where the
      // Context for that comes from. It deliberately does NOT come from
      // CarBrowserService: that service only exists while a head unit is
      // browsing, which is the one moment the cache is of no use. The cache
      // matters on the NEXT cold start, when the car asks and nothing of ours
      // is running to answer.
      CarLink.context = appContext.reactContext?.applicationContext
    }

    Function("getStatus") {
      mapOf("connected" to CarLink.connected)
    }

    AsyncFunction("publishTree") { tree: Map<String, Any?> ->
      CarLink.publish(tree)
    }

    OnStartObserving {
      CarLink.onCommand = { command -> sendEvent("onCarCommand", command) }
      CarLink.onStatus = { status -> sendEvent("onCarStatus", status) }
    }

    OnStopObserving {
      CarLink.onCommand = null
      CarLink.onStatus = null
    }
  }
}
