import AVFoundation
import AVKit
import ExpoModulesCore
import UIKit

/**
 Current output route + the system route picker.

 iOS gives no way to select an output port from code. `AVRoutePickerView` is the
 supported switcher, so `presentOutputPicker` mounts one invisibly and fires its
 button — the same sheet the AirPlay glyph opens anywhere else in the system.

 `AVAudioSession.currentRoute.outputs` is also the only truthful source for what
 is playing: the session reports the port it is actually feeding, so a connected
 but unselected Bluetooth set does not show up as current.
 */
public class AudioRouteModule: Module {
  private var routeObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("AudioRoute")

    Events("onRouteChange")

    Function("getRoutes") { () -> [String: Any] in
      AudioRouteModule.snapshot()
    }

    AsyncFunction("presentOutputPicker") { (promise: Promise) in
      // AVRoutePickerView is UIKit: main thread, and only once there is a window.
      DispatchQueue.main.async {
        promise.resolve(AudioRouteModule.presentPicker())
      }
    }

    OnStartObserving {
      self.routeObserver = NotificationCenter.default.addObserver(
        forName: AVAudioSession.routeChangeNotification,
        object: AVAudioSession.sharedInstance(),
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onRouteChange", AudioRouteModule.snapshot())
      }
    }

    OnStopObserving {
      if let observer = self.routeObserver {
        NotificationCenter.default.removeObserver(observer)
        self.routeObserver = nil
      }
    }
  }

  // MARK: - reading

  private static func snapshot() -> [String: Any] {
    let outputs = AVAudioSession.sharedInstance().currentRoute.outputs.map { describe($0) }
    var result: [String: Any] = [
      "available": outputs,
      "canPresentPicker": true,
    ]
    // A missing key reads as `undefined`, which the TS side normalises to null.
    if let current = outputs.first {
      result["current"] = current
    }
    return result
  }

  private static func describe(_ port: AVAudioSessionPortDescription) -> [String: Any] {
    return [
      "id": port.uid,
      "name": port.portName,
      "kind": kind(of: port.portType),
    ]
  }

  private static func kind(of portType: AVAudioSession.Port) -> String {
    switch portType {
    case .bluetoothA2DP, .bluetoothLE, .bluetoothHFP:
      return "bluetooth"
    case .headphones:
      return "headphones"
    case .builtInSpeaker, .builtInReceiver:
      return "speaker"
    case .airPlay:
      return "airplay"
    case .carAudio:
      return "car"
    case .usbAudio:
      return "usb"
    case .HDMI:
      return "hdmi"
    default:
      return "unknown"
    }
  }

  // MARK: - the picker

  private static func presentPicker() -> Bool {
    // The host is the TOPMOST view controller's view, not the window: the app
    // opens this from inside a React Native <Modal>, which is a presented view
    // controller, and a picker mounted below it would have to present its sheet
    // over a controller it is not part of.
    guard let host = topView() else { return false }

    // Inside the host's bounds, but 1pt and all but transparent: the sheet will
    // not present from a view that is off-screen or hidden.
    let picker = AVRoutePickerView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
    picker.alpha = 0.01
    picker.isUserInteractionEnabled = false
    host.addSubview(picker)

    guard let button = picker.subviews.compactMap({ $0 as? UIButton }).first else {
      picker.removeFromSuperview()
      return false
    }
    button.sendActions(for: .touchUpInside)

    // Long enough for the sheet to take over; removing it immediately cancels
    // the presentation on some iOS versions.
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
      picker.removeFromSuperview()
    }
    return true
  }

  private static func topView() -> UIView? {
    guard let window = keyWindow() else { return nil }
    var controller = window.rootViewController
    while let presented = controller?.presentedViewController {
      controller = presented
    }
    return controller?.view ?? window
  }

  private static func keyWindow() -> UIWindow? {
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
  }
}
