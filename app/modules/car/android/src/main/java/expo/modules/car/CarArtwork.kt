package expo.modules.car

import android.content.Context
import android.net.Uri
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Collections
import java.util.concurrent.Executors

/**
 * Album art for a head unit, on disk and behind a `content://` uri.
 *
 * WHY NOT JUST THE URL. The tree carries the same remote artwork urls the phone
 * UI uses, and Android Auto's projection host downloads those itself. Android
 * Automotive OS does not: the car's image loader resolves `content://`,
 * `file://` and `android.resource://`, and quietly draws a coloured placeholder
 * for anything it has to fetch over the network. Rows with correct titles and
 * no covers is exactly what that looks like.
 *
 * WHY NOT A BITMAP IN THE MediaItem. `MediaDescriptionCompat.setIconBitmap`
 * would work for one row and fail for a list: `onLoadChildren` answers with the
 * whole page in a single binder transaction, and fifty decoded covers do not fit
 * in the 1 MB a transaction gets.
 *
 * So: fetch once, keep the bytes in the cache directory under a hash of the
 * url, and hand the car a uri into [CarArtworkProvider]. Missing art is not an
 * error — the row simply draws the placeholder until the file lands, and the
 * service tells the car to redraw when it does.
 */
internal object CarArtwork {
  private const val TAG = "==car"
  private const val DIR = "car-artwork"

  /** Cover art is a thumbnail. Anything this size is not one, and not worth the cache. */
  private const val MAX_BYTES = 2 * 1024 * 1024
  private const val TIMEOUT_MS = 10_000

  /** Two at a time: this runs while the driver is looking at the list. */
  private val pool = Executors.newFixedThreadPool(2)
  private val inFlight = Collections.synchronizedSet(mutableSetOf<String>())

  fun key(url: String): String {
    val digest = MessageDigest.getInstance("SHA-1").digest(url.toByteArray())
    return digest.joinToString("") { "%02x".format(it) }
  }

  fun dir(context: Context): File = File(context.cacheDir, DIR).apply { mkdirs() }

  private fun file(context: Context, url: String) = File(dir(context), key(url))

  /** A uri the car can open, or null while the bytes are not here yet. */
  fun uri(context: Context, url: String): Uri? {
    val file = file(context, url)
    if (!file.isFile || file.length() == 0L) return null
    return Uri.parse("content://${context.packageName}.carartwork/${key(url)}")
  }

  /**
   * Fetch it if it is not here, and say so once. `onReady` fires on the pool
   * thread and only for a download that actually produced bytes.
   */
  fun prefetch(context: Context, url: String, onReady: () -> Unit) {
    val file = file(context, url)
    if (file.isFile && file.length() > 0L) return
    if (!inFlight.add(url)) return

    pool.execute {
      val ok = runCatching { download(url, file) }.getOrElse {
        Log.w(TAG, "artwork fetch failed for $url", it)
        false
      }
      inFlight.remove(url)
      if (ok) onReady()
    }
  }

  private fun download(url: String, into: File): Boolean {
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = TIMEOUT_MS
      readTimeout = TIMEOUT_MS
      instanceFollowRedirects = true
    }

    try {
      if (connection.responseCode !in 200..299) return false
      val declared = connection.contentLength
      if (declared > MAX_BYTES) return false

      // Write beside the target and rename, so a half-written file is never
      // visible to the provider — the car would open it and draw nothing.
      val partial = File(into.parentFile, "${into.name}.part")
      var total = 0
      connection.inputStream.use { input ->
        partial.outputStream().use { output ->
          val buffer = ByteArray(16 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read <= 0) break
            total += read
            if (total > MAX_BYTES) {
              partial.delete()
              return false
            }
            output.write(buffer, 0, read)
          }
        }
      }

      if (total == 0) {
        partial.delete()
        return false
      }
      return partial.renameTo(into)
    } finally {
      connection.disconnect()
    }
  }
}
