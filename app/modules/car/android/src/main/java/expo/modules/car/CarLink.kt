package expo.modules.car

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * The browse tree, and the wire back to JS.
 *
 * A process-wide singleton on purpose. `CarBrowserService` is created and
 * destroyed by the system whenever Android Auto feels like it, and the Expo
 * module is created and destroyed with the JS runtime — every reload in
 * development. Neither can own the tree, so it lives here and outlives both.
 *
 * The Swift half (modules/car/ios/CarModule.swift) is the same object with the
 * same responsibilities; the two are deliberately kept symmetrical so the shared
 * TypeScript in services/car.ts only has to reason about one thing.
 */
object CarLink {
  const val ROOT = "root"

  var onCommand: ((Map<String, Any?>) -> Unit)? = null
  var onStatus: ((Map<String, Any?>) -> Unit)? = null

  /** Set by the browser service while it is alive. */
  var onTree: (() -> Unit)? = null

  @Volatile
  var connected: Boolean = false
    private set

  @Volatile
  private var children: Map<String, List<Map<String, Any?>>> = emptyMap()

  val hasTree: Boolean
    get() = children.isNotEmpty()

  /**
   * The last published tree, on disk.
   *
   * On Android Auto the phone app is running, so JS is there to answer. On
   * Android Automotive OS there is no phone: the car starts this service by
   * itself, from a cold boot, with nothing else of ours alive. `onLoadChildren`
   * then parks the caller waiting for a `refresh` that only a running JS runtime
   * can answer, and the driver looks at an empty media app for ever.
   *
   * Keeping the last tree means the car has something the instant it asks —
   * the playlist as it was when the app last ran, which is exactly what the
   * driver expects. JS replaces it the moment it does come up.
   */
  private const val PREFS = "car-tree"
  private const val KEY_TREE = "children"

  fun restore(context: Context) {
    if (children.isNotEmpty()) return
    val json = runCatching {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_TREE, null)
    }.getOrNull() ?: return

    val restored = runCatching { decode(JSONObject(json)) }.getOrNull()
    if (restored.isNullOrEmpty()) return
    children = restored
    Log.i(TAG, "restored a cached tree with ${restored.size} parents")
  }

  private fun persist(context: Context, tree: Map<String, List<Map<String, Any?>>>) {
    runCatching {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_TREE, encode(tree).toString())
        .apply()
    }.onFailure { Log.w(TAG, "could not persist the tree", it) }
  }

  private fun encode(tree: Map<String, List<Map<String, Any?>>>): JSONObject {
    val root = JSONObject()
    for ((parent, nodes) in tree) {
      val array = JSONArray()
      for (node in nodes) array.put(JSONObject(node.filterValues { it != null }))
      root.put(parent, array)
    }
    return root
  }

  private fun decode(json: JSONObject): Map<String, List<Map<String, Any?>>> {
    val out = mutableMapOf<String, List<Map<String, Any?>>>()
    for (parent in json.keys()) {
      val array = json.optJSONArray(parent) ?: continue
      val nodes = mutableListOf<Map<String, Any?>>()
      for (i in 0 until array.length()) {
        val node = array.optJSONObject(i) ?: continue
        nodes += node.keys().asSequence().associateWith { node.get(it) }
      }
      out[parent] = nodes
    }
    return out
  }

  /** Set once by the browser service, which is the only thing here with one. */
  @Volatile
  var context: Context? = null

  @Suppress("UNCHECKED_CAST")
  fun publish(tree: Map<String, Any?>): Boolean {
    // Version-gate the same way the watch does: a build that cannot read the
    // shape must ignore it rather than render half of it.
    val version = (tree["v"] as? Number)?.toInt()
    if (version != 1) {
      Log.w(TAG, "ignoring tree, unreadable version ${tree["v"]}")
      return false
    }

    val raw = tree["children"] as? Map<*, *>
    if (raw == null) {
      Log.w(TAG, "ignoring tree, no children")
      return false
    }

    // Element-wise, like the Swift half. A single cast to
    // Map<String, List<Map<String, Any?>>> is erased to a bare Map check and
    // therefore ALWAYS succeeds — the wrong shape then survives publish() and
    // surfaces later as a ClassCastException inside a system callback, which is
    // a long way from where the mistake is. Rejecting per element keeps the
    // failure here, and keeps a single bad node from costing the whole tree.
    val next = mutableMapOf<String, List<Map<String, Any?>>>()
    for ((parent, value) in raw) {
      val parentId = parent as? String ?: continue
      val nodes = value as? List<*> ?: continue
      next[parentId] = nodes.mapNotNull { it as? Map<String, Any?> }
    }

    children = next
    context?.let { persist(it, next) }
    onTree?.invoke()
    return true
  }

  fun nodes(under: String): List<Map<String, Any?>> = children[under] ?: emptyList()

  fun send(command: String, nodeId: String? = null) {
    val payload = mutableMapOf<String, Any?>("command" to command)
    if (nodeId != null) payload["nodeId"] = nodeId
    onCommand?.invoke(payload)
  }

  fun setConnected(value: Boolean) {
    connected = value
    onStatus?.invoke(mapOf("connected" to value))
  }

  private const val TAG = "==car"
}
