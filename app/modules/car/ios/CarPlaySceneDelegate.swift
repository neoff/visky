import CarPlay
import UIKit

/**
 The CarPlay screen.

 Named by its Objective-C symbol, not its Swift one: the Info.plist scene
 manifest written by plugins/withCarPlay.js names `ViskyCarPlaySceneDelegate`,
 and the usual `$(PRODUCT_MODULE_NAME).Class` form would resolve to the app
 target while this class lives in the Car pod. `@objc` gives the runtime a flat
 name that is found from anywhere.

 The scene is a SECOND scene, live at the same time as the phone's window. It
 can connect before JS has started, survive a JS reload, and stay attached while
 the phone app is backgrounded — so it never assumes the tree is there, and it
 asks for a refresh whenever it comes up empty.
 */
@objc(ViskyCarPlaySceneDelegate)
public class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  private var interfaceController: CPInterfaceController?
  /// The root list per root node id, kept so a tree update can refresh the
  /// visible rows in place instead of rebuilding the tab bar under the driver.
  private var rootTemplates: [(id: String, template: CPListTemplate)] = []

  /// Keyed by the root ids in modules/car/src/Car.types.ts.
  private static let tabIcons = [
    "songs": "music.note.list",
    "favorites": "heart.fill",
    "artists": "music.mic",
  ]

  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    self.interfaceController = interfaceController

    CarLink.shared.onTree = { [weak self] in self?.treeChanged() }
    CarLink.shared.setConnected(true)
    // JS may be running with a tree we have never seen, or not running at all.
    // Either way, ask; `startCarLink` also pushes on connect.
    CarLink.shared.send("refresh")

    interfaceController.setRootTemplate(rootTemplate(), animated: false, completion: nil)
  }

  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController
  ) {
    CarLink.shared.onTree = nil
    CarLink.shared.setConnected(false)
    self.interfaceController = nil
    rootTemplates = []
  }

  // MARK: - Templates

  /**
   A tab bar once there is something to put in it, a placeholder before that.

   CPTabBarTemplate rejects an empty tab list, and a cold start always has one:
   the scene can connect seconds before the JS runtime finishes booting. Showing
   a one-line list and swapping it for the real thing is the honest version of
   that wait.
   */
  private func rootTemplate() -> CPTemplate {
    let roots = CarLink.shared.nodes(under: "root")
    guard !roots.isEmpty else {
      let waiting = CPListItem(text: "Connecting…", detailText: nil)
      return CPListTemplate(title: "visky", sections: [CPListSection(items: [waiting])])
    }

    rootTemplates = roots.prefix(CPTabBarTemplate.maximumTabCount).map { node in
      let id = node["id"] as? String ?? ""
      let title = node["title"] as? String ?? ""
      let template = CPListTemplate(title: title, sections: [section(under: id)])
      template.tabTitle = title
      // Without an image every tab renders as the system "More" tab — icon and
      // label both — and the titles set above are simply dropped. The tree's
      // root ids are fixed by the wire format precisely so each side can map
      // them to something native; SF Symbols do not travel, so the mapping
      // lives here rather than in the published tree.
      template.tabImage = Self.tabIcons[id].flatMap { UIImage(systemName: $0) }
      return (id: id, template: template)
    }

    return CPTabBarTemplate(templates: rootTemplates.map { $0.template })
  }

  private func section(under parentId: String) -> CPListSection {
    CPListSection(items: CarLink.shared.nodes(under: parentId).map { item(for: $0) })
  }

  private func item(for node: [String: Any]) -> CPListItem {
    let listItem = CPListItem(
      text: node["title"] as? String ?? "",
      detailText: node["subtitle"] as? String
    )

    let browsable = node["browsable"] as? Bool ?? false
    listItem.isPlaying = node["nowPlaying"] as? Bool ?? false
    // The disclosure chevron is what tells a driver at a glance whether a row
    // opens a list or starts the music.
    listItem.accessoryType = browsable ? .disclosureIndicator : .none

    if let artwork = node["artwork"] as? String, let url = URL(string: artwork) {
      CarArtwork.load(url) { [weak listItem] image in
        listItem?.setImage(image)
      }
    }

    let nodeId = node["id"] as? String ?? ""
    listItem.handler = { [weak self] _, completion in
      self?.select(nodeId: nodeId, browsable: browsable)
      completion()
    }

    return listItem
  }

  private func select(nodeId: String, browsable: Bool) {
    guard let interfaceController = interfaceController else { return }

    if browsable {
      // Look the row up wherever it lives, not just under the root. Every
      // browsable row that is actually PUSHED is an artist, and artists sit
      // under "artists" — searching the root only ever matched the three tabs,
      // which are never pushed, so the pushed list came up with no title at all.
      let title = CarLink.shared.node(withId: nodeId)?["title"] as? String
      let template = CPListTemplate(title: title ?? "", sections: [section(under: nodeId)])
      interfaceController.pushTemplate(template, animated: true, completion: nil)
      return
    }

    // Playback is JS's job; all this side does is show the screen the driver
    // expects to land on. The transport there is driven by
    // MPNowPlayingInfoCenter, which react-native-track-player fills.
    CarLink.shared.send("play", nodeId: nodeId)
    interfaceController.pushTemplate(CPNowPlayingTemplate.shared, animated: true, completion: nil)
  }

  // MARK: - Updates

  /**
   Refresh in place, and only the roots.

   Replacing the root template on every tree change would throw the driver back
   to the first tab mid-scroll. Updating each root list's sections leaves the
   selected tab, the scroll position and any pushed sub-list alone. Pushed
   artist lists are a snapshot by design: they are read in seconds and rebuilt
   on the next visit.
   */
  private func treeChanged() {
    guard let interfaceController = interfaceController else { return }

    if rootTemplates.isEmpty {
      interfaceController.setRootTemplate(rootTemplate(), animated: false, completion: nil)
      return
    }

    for root in rootTemplates {
      root.template.updateSections([section(under: root.id)])
    }
  }
}

/**
 Album art for list rows.

 CarPlay hands back a `CPListItem` that wants a `UIImage`, and the tree carries
 URLs — the same ones the phone UI uses, so they are already in the OS URL cache
 more often than not. The NSCache on top is for the scroll: a list redraw asks
 for the same twenty images again, and going back to URLSession each time makes
 rows flicker.
 */
private enum CarArtwork {
  private static let cache = NSCache<NSURL, UIImage>()

  static func load(_ url: URL, completion: @escaping (UIImage) -> Void) {
    if let cached = cache.object(forKey: url as NSURL) {
      completion(cached)
      return
    }

    URLSession.shared.dataTask(with: url) { data, _, _ in
      guard let data = data, let image = UIImage(data: data) else { return }
      cache.setObject(image, forKey: url as NSURL)
      DispatchQueue.main.async { completion(image) }
    }.resume()
  }
}
