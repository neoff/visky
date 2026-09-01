import SwiftUI

@main
struct ViskyWatchApp: App {
  @StateObject private var link = WatchLink.shared

  var body: some Scene {
    WindowGroup {
      NavigationStack {
        NowPlayingView()
      }
      .environmentObject(link)
      .onAppear {
        link.activate()
      }
    }
  }
}
