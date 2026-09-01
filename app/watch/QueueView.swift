import SwiftUI

/// The phone's queue. Tapping a row starts it ON THE PHONE — the watch never
/// plays audio itself, it is a remote.
struct QueueView: View {
  @EnvironmentObject private var link: WatchLink

  var body: some View {
    List {
      if link.state.queue.isEmpty {
        Text("Nothing queued")
          .font(.footnote)
          .foregroundStyle(.secondary)
      } else {
        ForEach(link.state.queue) { item in
          Button {
            link.send("playTrack", trackId: item.id)
          } label: {
            HStack(spacing: 8) {
              if item.id == link.state.trackId {
                Image(systemName: "speaker.wave.2.fill")
                  .font(.caption2)
                  .foregroundStyle(.tint)
              }
              VStack(alignment: .leading, spacing: 1) {
                Text(item.title)
                  .font(.caption)
                  .lineLimit(2)
                if let artist = item.artist {
                  Text(artist)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                }
              }
            }
          }
        }
      }
    }
    .navigationTitle("Playlist")
  }
}
