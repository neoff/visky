import ExpoModulesCore
import WatchConnectivity

/**
 The phone half of the watch link.

 WCSession is a process-wide singleton with a delegate that can only be set
 once, which is why the session lives in `WatchLink` and the Expo module is a
 thin shell over it: the module is created and destroyed with the JS runtime
 (every reload), the session is not.

 Nothing here starts playback. The watch can only ask a RUNNING phone app to do
 something — the same limit the "Play on" device list works under: a message can
 wake an app that is suspended with audio, but nothing can make a terminated app
 play.
 */
public class WatchBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchBridge")

    Events("onWatchCommand", "onWatchStatus")

    OnCreate {
      WatchLink.shared.activate()
    }

    Function("getStatus") { () -> [String: Any] in
      WatchLink.shared.status()
    }

    AsyncFunction("publish") { (snapshot: [String: Any], promise: Promise) in
      promise.resolve(WatchLink.shared.publish(snapshot))
    }

    OnStartObserving {
      WatchLink.shared.onCommand = { [weak self] command in
        self?.sendEvent("onWatchCommand", command)
      }
      WatchLink.shared.onStatus = { [weak self] status in
        self?.sendEvent("onWatchStatus", status)
      }
    }

    OnStopObserving {
      WatchLink.shared.onCommand = nil
      WatchLink.shared.onStatus = nil
    }
  }
}

final class WatchLink: NSObject, WCSessionDelegate {
  static let shared = WatchLink()

  var onCommand: (([String: Any]) -> Void)?
  var onStatus: (([String: Any]) -> Void)?

  /// The last thing we sent, replayed when the watch asks for a refresh before
  /// JS has produced anything new.
  private var latest: [String: Any]?

  private var session: WCSession? {
    WCSession.isSupported() ? WCSession.default : nil
  }

  func activate() {
    guard let session = session else { return }
    // Setting the delegate twice is harmless; activating an already-active
    // session is a no-op. Both happen on every JS reload in development.
    session.delegate = self
    if session.activationState != .activated {
      session.activate()
    }
  }

  func status() -> [String: Any] {
    guard let session = session else {
      return ["supported": false, "paired": false, "installed": false, "reachable": false]
    }
    return [
      "supported": true,
      "paired": session.isPaired,
      "installed": session.isWatchAppInstalled,
      "reachable": session.isReachable,
    ]
  }

  @discardableResult
  func publish(_ snapshot: [String: Any]) -> Bool {
    guard let session = session, session.activationState == .activated else { return false }
    latest = snapshot

    // The context is the one that survives: it replaces whatever was queued and
    // is handed over the next time the watch runs, however much later.
    do {
      try session.updateApplicationContext(snapshot)
    } catch {
      NSLog("[visky] watch context failed: \(error.localizedDescription)")
    }

    // And the message is the one that arrives NOW, when the wrist is up.
    if session.isReachable {
      session.sendMessage(snapshot, replyHandler: nil) { error in
        NSLog("[visky] watch message failed: \(error.localizedDescription)")
      }
    }
    return true
  }

  // MARK: - WCSessionDelegate

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    if let error = error {
      NSLog("[visky] watch session failed to activate: \(error.localizedDescription)")
    }
    notifyStatus()
  }

  func sessionDidBecomeInactive(_ session: WCSession) {
    notifyStatus()
  }

  func sessionDidDeactivate(_ session: WCSession) {
    // Reactivate: this fires when the user switches to a different watch, and
    // without it the link is dead until the app is relaunched.
    session.activate()
  }

  func sessionWatchStateDidChange(_ session: WCSession) {
    notifyStatus()
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    notifyStatus()
    // A watch that just became reachable has whatever context it was last
    // given, which may be minutes old. Push the latest immediately.
    if session.isReachable, let latest = latest {
      publish(latest)
    }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    deliver(message)
  }

  func session(
    _ session: WCSession,
    didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    deliver(message)
    // The watch asks for the current state on launch; answer with the last
    // snapshot so its first frame is not empty.
    replyHandler(latest ?? [:])
  }

  private func deliver(_ message: [String: Any]) {
    guard message["command"] is String else { return }
    DispatchQueue.main.async { [weak self] in
      self?.onCommand?(message)
    }
  }

  private func notifyStatus() {
    let snapshot = status()
    DispatchQueue.main.async { [weak self] in
      self?.onStatus?(snapshot)
    }
  }
}
