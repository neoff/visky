import ImageIO
import SwiftUI
import UIKit

/**
 Cover art on the wrist.

 The phone sends a url, never the bytes: the application context it travels in
 is capped at 256 KB, and one cover is a good fraction of that while a whole
 show's worth of rows share the same one. So the watch fetches, and the point of
 everything below is that it fetches each cover exactly once.

 Two caches, doing different jobs. `URLCache` keeps the compressed bytes on
 disk, so a cover survives the app being killed and the walk back to the car.
 The `NSCache` above it keeps the DECODED thumbnail, because the expensive part
 of drawing a 650x340 jpeg in a 24pt row is the decode, not the download, and a
 watch list redraws constantly.
 */
enum Artwork {
  /**
   Big enough for the now playing cover on the largest watch, small enough that
   sixty of them do not matter. Everything is decoded to this one size and left
   to SwiftUI to scale down for a row, so the cache can be keyed by url alone.
   */
  private static let maxPixels: CGFloat = 240

  private static let decoded: NSCache<NSURL, UIImage> = {
    let cache = NSCache<NSURL, UIImage>()
    // A playlist page is 60 rows and a show repeats across many of them, so the
    // number of DISTINCT covers on screen is far smaller than the row count.
    cache.countLimit = 80
    return cache
  }()

  private static let session: URLSession = {
    let config = URLSessionConfiguration.default
    config.urlCache = URLCache(
      memoryCapacity: 2 * 1024 * 1024,
      diskCapacity: 32 * 1024 * 1024,
      directory: nil
    )
    config.requestCachePolicy = .returnCacheDataElseLoad
    // The watch reaches the network through the phone more often than not, and
    // a cover that has not arrived is not worth a spinner that never ends.
    config.timeoutIntervalForRequest = 20
    config.waitsForConnectivity = false
    return URLSession(configuration: config)
  }()

  static func image(for url: URL) async -> UIImage? {
    if let hit = decoded.object(forKey: url as NSURL) { return hit }

    guard let (data, response) = try? await session.data(from: url) else { return nil }
    if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
      NSLog("[visky] artwork \(http.statusCode) for \(url.lastPathComponent)")
      return nil
    }
    guard let image = thumbnail(from: data) else { return nil }

    decoded.setObject(image, forKey: url as NSURL)
    return image
  }

  /**
   Decode straight to the size that will be drawn.

   ImageIO rather than `UIImage(data:)`: this never materialises the full size
   bitmap, which for the 600x600 png covers is 1.4 MB a piece — sixty of those
   is how a watch app gets killed for memory.
   */
  private static func thumbnail(from data: Data) -> UIImage? {
    guard
      let source = CGImageSourceCreateWithData(
        data as CFData,
        [kCGImageSourceShouldCache: false] as CFDictionary
      )
    else { return nil }

    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: maxPixels,
    ]

    guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    else { return nil }
    return UIImage(cgImage: cgImage)
  }
}

/**
 A cover, or the space where one goes.

 Always the same size whether the image is there or not: a row that grows when
 its cover lands makes the whole list jump under the finger.
 */
struct ArtworkView: View {
  let url: String?
  var side: CGFloat
  var corner: CGFloat = 4

  @State private var image: UIImage?

  var body: some View {
    Group {
      if let image = image {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
      } else {
        ZStack {
          Color.white.opacity(0.10)
          Image(systemName: "music.note")
            .font(.system(size: side * 0.4))
            .foregroundStyle(.secondary)
        }
      }
    }
    .frame(width: side, height: side)
    .clipShape(RoundedRectangle(cornerRadius: corner, style: .continuous))
    // Keyed by the url: a row is recycled onto a different track as the list
    // scrolls, and without the id the first cover would stay on it.
    .task(id: url) {
      image = nil
      guard let url = url, let parsed = URL(string: url) else { return }
      let loaded = await Artwork.image(for: parsed)
      // The row may have been recycled while this was in flight.
      guard !Task.isCancelled else { return }
      image = loaded
    }
  }
}
