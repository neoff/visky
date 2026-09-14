import SwiftUI

/// What is playing on the phone, and the four controls.
struct NowPlayingView: View {
  @EnvironmentObject private var link: WatchLink

  var body: some View {
    // Scrolls because the cover costs 64pt and the smallest watch does not have
    // them spare: without this the Playlist button falls off the bottom edge on
    // a 40mm, where it is the only way into the list.
    ScrollView {
      content
    }
    .navigationTitle("visky")
  }

  private var content: some View {
    VStack(spacing: 8) {
      // Only once the phone has said something. Before that the screen is a
      // sentence asking for the phone, and a placeholder square above it would
      // read as "there is a track, it just has no cover".
      if link.state.known {
        ArtworkView(url: link.state.artwork, side: 64, corner: 8)
      }

      title

      HStack(spacing: 18) {
        ControlButton(system: "backward.fill") {
          link.send("previous")
        }

        ControlButton(system: link.state.playing ? "pause.fill" : "play.fill", prominent: true) {
          // Optimistic: the phone's reply corrects it a moment later.
          link.optimisticallySetPlaying(!link.state.playing)
          link.send("toggle")
        }

        ControlButton(system: "forward.fill") {
          link.send("next")
        }
      }

      NavigationLink {
        QueueView()
      } label: {
        Label("Playlist", systemImage: "list.bullet")
          .font(.footnote)
      }
      .buttonStyle(.bordered)
    }
    .padding(.horizontal, 4)
  }

  @ViewBuilder
  private var title: some View {
    if !link.state.known {
      Text("Open visky on the phone")
        .font(.footnote)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
    } else {
      VStack(spacing: 2) {
        Text(link.state.title ?? "Nothing playing")
          .font(.headline)
          .lineLimit(2)
          .multilineTextAlignment(.center)
        if let artist = link.state.artist {
          Text(artist)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
    }
  }
}

private struct ControlButton: View {
  let system: String
  var prominent = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: system)
        .font(prominent ? .title2 : .title3)
        .frame(width: prominent ? 44 : 34, height: prominent ? 44 : 34)
    }
    .buttonStyle(.plain)
    .background(Color.white.opacity(prominent ? 0.18 : 0.10))
    .clipShape(Circle())
  }
}
