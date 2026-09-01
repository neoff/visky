import Foundation
import WatchConnectivity

/// One entry of the phone's queue, as the watch sees it.
struct QueueItem: Identifiable, Hashable {
  let id: String
  let title: String
  let artist: String?
}

/// Everything the watch draws.
struct PlayerState {
  var playing = false
  var title: String?
  var artist: String?
  var trackId: String?
  var queue: [QueueItem] = []
  /// false until the first payload arrives, so the UI can say "no phone" rather
  /// than showing an empty player as if nothing were playing.
  var known = false
}

/**
 The watch half of the link. Mirrors `modules/watch-bridge` on the phone; the
 wire format is written down in `WatchBridge.types.ts` and duplicated by hand
 here on purpose — it crosses a device boundary, so it changes like a protocol.

 Two inbound channels, because the phone sends on both: `didReceiveMessage`
 while this app is in the foreground, and `didReceiveApplicationContext` for
 whatever was true while the wrist was down. Whichever arrives is applied; they
 carry the identical payload.
 */
final class WatchLink: NSObject, ObservableObject {
  static let shared = WatchLink()

  @Published private(set) var state = PlayerState()

  private var session: WCSession? {
    WCSession.isSupported() ? WCSession.default : nil
  }

  func activate() {
    guard let session = session else { return }
    session.delegate = self
    if session.activationState != .activated {
      session.activate()
    }
    // The context may already be sitting there from before this app launched.
    apply(session.receivedApplicationContext)
    refresh()
  }

  /// Ask the phone for the current state. Answered by the reply handler, so it
  /// works even when nothing has changed and no push is coming.
  func refresh() {
    guard let session = session, session.isReachable else { return }
    session.sendMessage(["command": "refresh"], replyHandler: { [weak self] reply in
      self?.apply(reply)
    }, errorHandler: { error in
      NSLog("[visky] refresh failed: \(error.localizedDescription)")
    })
  }

  func send(_ command: String, trackId: String? = nil) {
    guard let session = session else { return }
    var message: [String: Any] = ["command": command]
    if let trackId = trackId {
      message["trackId"] = trackId
    }

    guard session.isReachable else {
      // Not reachable means the phone app is not running. Nothing can start it
      // from here, so say so instead of dropping the tap silently.
      NSLog("[visky] phone not reachable; command dropped")
      return
    }

    session.sendMessage(message, replyHandler: { [weak self] reply in
      self?.apply(reply)
    }, errorHandler: { error in
      NSLog("[visky] command failed: \(error.localizedDescription)")
    })
  }

  /// Flip the button now, let the phone's answer correct it. A watch tap that
  /// does nothing for 300 ms reads as a missed tap and gets pressed again.
  func optimisticallySetPlaying(_ playing: Bool) {
    DispatchQueue.main.async {
      self.state.playing = playing
    }
  }

  private func apply(_ payload: [String: Any]) {
    guard !payload.isEmpty else { return }
    // A future phone build may send a shape this watch cannot read. Ignoring it
    // leaves the last good state on screen, which beats a blank one.
    //
    // Read through NSNumber rather than `as? Int`. The number started life in
    // JavaScript and has crossed two boundaries to get here; whether it lands as
    // an integer or a double is not ours to decide, and a conditional cast
    // straight to Int fails for the double. That is not a hypothetical — the
    // identical `as? Int` on the car's tree dropped every publish and cost an
    // afternoon, because the failure is a silent `return` inside a guard.
    guard let version = (payload["v"] as? NSNumber)?.intValue, version == 1 else {
      NSLog("[visky] ignoring payload, unreadable version \(String(describing: payload["v"]))")
      return
    }

    let queue: [QueueItem] = (payload["queue"] as? [[String: Any]] ?? []).compactMap { entry in
      guard let id = entry["id"] as? String, let title = entry["title"] as? String else { return nil }
      return QueueItem(id: id, title: title, artist: entry["artist"] as? String)
    }

    DispatchQueue.main.async {
      self.state = PlayerState(
        playing: payload["playing"] as? Bool ?? false,
        title: payload["title"] as? String,
        artist: payload["artist"] as? String,
        trackId: payload["trackId"] as? String,
        queue: queue,
        known: true
      )
    }
  }
}

extension WatchLink: WCSessionDelegate {
  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    if let error = error {
      NSLog("[visky] watch session failed: \(error.localizedDescription)")
      return
    }
    apply(session.receivedApplicationContext)
    refresh()
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    apply(message)
  }

  func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
    apply(context)
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    if session.isReachable {
      refresh()
    }
  }
}
