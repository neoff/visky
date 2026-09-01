import ExpoModulesCore

/**
 The JS-facing half of the car integration.

 The module is a thin shell over `CarLink` for the same reason WatchBridgeModule
 is a shell over WatchLink: the module object is created and destroyed with the
 JS runtime — every reload in development — while the CarPlay scene outlives it.
 The scene is owned by UIKit and can connect before JS is up and stay connected
 across a reload, so the state it reads has to live somewhere that does not
 churn.

 Note what this module does NOT do: it publishes no now-playing state. The title,
 artwork, duration and transport on the CarPlay Now Playing screen all come from
 `MPNowPlayingInfoCenter`, which react-native-track-player already keeps filled.
 Pushing our own copy would be a second source of truth for something the system
 never asks us about.
 */
public class CarModule: Module {
  /**
   The link anchor for the CarPlay scene delegate.

   Nothing in this codebase calls `CarPlaySceneDelegate`: UIKit instantiates it
   from the class NAME in the Info.plist scene manifest, at runtime, through the
   Objective-C runtime. To the linker that is not a reference at all — and the
   class lives in the static `Car` pod, so a Release link is entitled to drop
   the object file it sits in. That failure never shows up in a build log; it
   shows up as the app appearing on the CarPlay dashboard and then going black,
   on Release only, which is to say on TestFlight and not on any build made
   while developing it.

   Naming the class here, from the one type in this pod the app is guaranteed to
   link (the generated `ExpoModulesProvider` lists this module by name), gives
   the linker the reference it needs. `OnCreate` below then prints it, so the
   anchor is a real use rather than something a later optimiser can fold away.
   */
  private static let sceneDelegateClass: AnyClass = CarPlaySceneDelegate.self

  public func definition() -> ModuleDefinition {
    Name("Car")

    Events("onCarCommand", "onCarStatus")

    OnCreate {
      // Doubles as the check for the above: if this line ever prints something
      // other than ViskyCarPlaySceneDelegate, the scene manifest and the class
      // have drifted apart and CarPlay will not start.
      NSLog("==car: module ready, scene delegate %@", NSStringFromClass(Self.sceneDelegateClass))
    }

    Function("getStatus") { () -> [String: Any] in
      ["connected": CarLink.shared.connected]
    }

    AsyncFunction("publishTree") { (tree: [String: Any], promise: Promise) in
      promise.resolve(CarLink.shared.publish(tree))
    }

    OnStartObserving {
      CarLink.shared.onCommand = { [weak self] command in
        self?.sendEvent("onCarCommand", command)
      }
      CarLink.shared.onStatus = { [weak self] status in
        self?.sendEvent("onCarStatus", status)
      }
    }

    OnStopObserving {
      CarLink.shared.onCommand = nil
      CarLink.shared.onStatus = nil
    }
  }
}

/**
 The browse tree, and the wire back to JS.

 Deliberately has no CarPlay types in it. The scene delegate reads this and
 turns it into templates; keeping the two apart means the tree can be inspected
 (and, later, served to something else) without a head unit attached.
 */
final class CarLink {
  static let shared = CarLink()

  var onCommand: (([String: Any]) -> Void)?
  var onStatus: (([String: Any]) -> Void)?
  /// Set by the scene delegate while it is connected. Called on the main queue.
  var onTree: (() -> Void)?

  private(set) var connected = false
  private(set) var children: [String: [[String: Any]]] = [:]

  /// True once JS has sent anything at all. The scene shows a placeholder until
  /// then rather than an empty tab bar, which CarPlay will not accept.
  var hasTree: Bool { !children.isEmpty }

  @discardableResult
  func publish(_ tree: [String: Any]) -> Bool {
    // Version-gate the same way the watch does: a head unit running an older
    // build must ignore a shape it cannot read, not half-render it.
    //
    // `as? Int` is deliberately NOT used on the version. A JS number arrives
    // here as an NSNumber or a Double depending on how the value crossed, and
    // a conditional cast straight to Int fails for the Double case — silently,
    // because this is a guard. That failure looks exactly like "the car never
    // got a tree", which is a long way from where the mistake is.
    guard let version = (tree["v"] as? NSNumber)?.intValue, version == 1 else {
      NSLog("==car: ignoring tree, unreadable version %@", String(describing: tree["v"]))
      return false
    }

    // Element-wise, for the same reason: a deep conditional cast to
    // [String: [[String: Any]]] has to bridge every nested container at once
    // and gives no clue which element refused.
    guard let raw = tree["children"] as? [String: Any] else {
      NSLog("==car: ignoring tree, no children")
      return false
    }

    var children: [String: [[String: Any]]] = [:]
    for (parent, value) in raw {
      guard let nodes = value as? [Any] else { continue }
      children[parent] = nodes.compactMap { $0 as? [String: Any] }
    }

    DispatchQueue.main.async {
      self.children = children
      self.onTree?()
    }
    return true
  }

  func nodes(under id: String) -> [[String: Any]] {
    children[id] ?? []
  }

  /// A node by id, wherever it sits. The head unit hands back only the id of the
  /// row that was tapped, and the tree is flat by parent, so finding out what
  /// was tapped means a scan. It is bounded by the caps in services/car.ts.
  func node(withId id: String) -> [String: Any]? {
    for (_, nodes) in children {
      if let match = nodes.first(where: { $0["id"] as? String == id }) { return match }
    }
    return nil
  }

  func send(_ command: String, nodeId: String? = nil) {
    var payload: [String: Any] = ["command": command]
    if let nodeId = nodeId { payload["nodeId"] = nodeId }
    onCommand?(payload)
  }

  func setConnected(_ value: Bool) {
    connected = value
    onStatus?(["connected": value])
  }
}
