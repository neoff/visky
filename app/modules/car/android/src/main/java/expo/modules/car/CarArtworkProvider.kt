package expo.modules.car

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File

/**
 * Serves cached album art to the car, and nothing else.
 *
 * The head unit is a different process, so a `file://` uri into our private
 * cache is unreadable to it and a `http(s)` one is not fetched at all — see
 * [CarArtwork]. A `content://` uri is the one form the car's image loader will
 * open, and that needs a provider.
 *
 * It is exported, because the client is the system media centre and a browse
 * result carries no uri grant with it. What that exposes is bounded on purpose:
 *
 * - read only — `openFile` refuses any mode but `r`, and there is no insert,
 *   update or delete;
 * - one directory — the artwork cache, never a path the caller chooses;
 * - one name shape — a 40-character hex SHA-1, so `..` and absolute paths are
 *   not merely escaped, they cannot be spelled.
 *
 * The contents are album covers that were already public on the internet a
 * moment ago. Nothing about the user is reachable through here.
 */
class CarArtworkProvider : ContentProvider() {
  override fun onCreate(): Boolean = true

  override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor? {
    if (mode != "r") throw SecurityException("car artwork is read-only")
    val file = resolve(uri) ?: return null
    return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
  }

  override fun getType(uri: Uri): String = "image/*"

  /**
   * Some image loaders ask for the size before opening. Answering keeps them
   * from treating the uri as unreadable.
   */
  override fun query(
    uri: Uri,
    projection: Array<out String>?,
    selection: String?,
    selectionArgs: Array<out String>?,
    sortOrder: String?
  ): Cursor? {
    val file = resolve(uri) ?: return null
    val columns = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
    val cursor = MatrixCursor(columns)
    cursor.addRow(
      columns.map { column ->
        when (column) {
          OpenableColumns.DISPLAY_NAME -> file.name
          OpenableColumns.SIZE -> file.length()
          else -> null
        }
      }.toTypedArray()
    )
    return cursor
  }

  private fun resolve(uri: Uri): File? {
    val context = context ?: return null
    val name = uri.lastPathSegment ?: return null
    if (!NAME.matches(name)) return null
    return File(CarArtwork.dir(context), name).takeIf { it.isFile && it.length() > 0 }
  }

  override fun insert(uri: Uri, values: ContentValues?): Uri? =
    throw UnsupportedOperationException("car artwork is read-only")

  override fun update(
    uri: Uri,
    values: ContentValues?,
    selection: String?,
    selectionArgs: Array<out String>?
  ): Int = throw UnsupportedOperationException("car artwork is read-only")

  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int =
    throw UnsupportedOperationException("car artwork is read-only")

  private companion object {
    /** Exactly what [CarArtwork.key] produces, and nothing else. */
    val NAME = Regex("^[0-9a-f]{40}$")
  }
}
