# VK Audio API Reference

> **Important**: VK removed official Audio API documentation from public access. This document preserves API methods used in visky-api project.

## Sources
- https://web.archive.org/web/20161216124951/https://vk.com/dev/audio - VK Audio API Official Documentation (archived Dec 16, 2016)
- https://web.archive.org/web/20170205141608/https://vk.com/dev/audio - VK Audio API Official Documentation (archived Feb 5, 2017)
- https://vodka2.github.io/vk-audio-token/ - VK Audio Token API reference (archived)
- https://vknet.github.io/vk/ - VKNet library documentation
- https://habr.com/ru/articles/340810/ - "Тащим музыку из ВК без публичного music API"
- https://habr.com/ru/articles/250379/ - "VkPlaylistServer — добавляем музыку из ВКонтакте в почти любой аудиоплеер"

---

## Complete VK Audio API Methods List

**Total**: 21 methods (as of Dec 2016 before API removal)

### Currently Used in visky-api
- ✅ `audio.get` - Get audio files from user/community
- ✅ `audio.getById` - Get audio by IDs
- ✅ `audio.add` - Add audio to library (commented)
- ✅ `audio.delete` - Delete audio (commented)
- ✅ `audio.search` - Search for audio

### Album Management (6 methods)
- 📦 `audio.getAlbums` - List albums
- 📦 `audio.addAlbum` - Create album
- 📦 `audio.editAlbum` - Edit album
- 📦 `audio.deleteAlbum` - Delete album  
- 📦 `audio.moveToAlbum` - Move tracks to album
- 📦 `audio.getAlbum` - Get album (deprecated)

### Track Management (4 methods)
- ✏️ `audio.edit` - Edit track metadata
- ✏️ `audio.reorder` - Change track order
- ✏️ `audio.restore` - Restore deleted track
- ✏️ `audio.getLyrics` - Get lyrics text

### Upload (2 methods)
- ⬆️ `audio.getUploadServer` - Get upload URL
- ⬆️ `audio.save` - Save uploaded track

### Discovery & Social (5 methods)
- 🎵 `audio.getRecommendations` - Get recommended tracks
- 🎵 `audio.getPopular` - Get popular tracks
- 🎵 `audio.setBroadcast` - Broadcast to status
- 🎵 `audio.getBroadcastList` - Get broadcasting users
- 🎵 `audio.getCount` - Count user's tracks

### Playlists (Modern API)
- 🆕 `audio.createPlaylist` - Create playlist (newer method)
- 🆕 `audio.searchPlaylists` - Search playlists (newer method)

---

## API Methods Used in visky-api

### audio.get

**Description**: Returns a list of audio files from user or community.

**Parameters**:
- `owner_id` (integer) - ID of the user or community that owns the audio files
  - Positive number = user ID
  - Negative number = community ID (e.g., `-42311167` for Frisky Radio VK group)
- `count` (integer, optional) - Number of audio files to return (default: 50, max: 6000)
- `offset` (integer, optional) - Offset needed to return a specific subset of audio files (default: 0)
- `playlist_id` (integer, optional) - Playlist ID to get audio from
- `access_hash` (string, optional) - Access hash for private playlists

**Returns**: `VkPlaylistResponse` object
```typescript
{
  count: number;        // Total number of audio files
  items: Array<{
    id: number;         // Audio file ID
    owner_id: number;   // Owner ID
    artist: string;     // Artist name
    title: string;      // Track title
    duration: number;   // Duration in seconds
    url: string;        // Direct link to audio file (may be encrypted)
    date: number;       // Date added (Unix timestamp)
    album_id?: number;  // Album ID (if exists)
    genre_id?: number;  // Genre ID
    track_code?: string;// Track code for statistics
  }>;
}
```

**Usage in visky-api**:
```typescript
// Get Frisky Radio playlist
await vkMethod(req, "audio.get", {
  count: 100,
  offset: 0,
  owner_id: -42311167  // Frisky Radio VK group
}, false);

// Get user's favorites playlist
await vkMethod(req, "audio.get", {
  owner_id: req.session.user_id,
  playlist_id: playlistId,
  count: 50,
  offset: 0
}, false);
```

---

### audio.getById

**Description**: Returns information about audio files by their IDs.

**Parameters**:
- `audios` (string) - Audio file IDs in format `{owner_id}_{audio_id}` separated by commas
  - Example: `"123456_789012,987654_321098"`
  - Can request multiple tracks at once

**Returns**: Array of audio objects (same structure as `audio.get`)

**Usage in visky-api**:
```typescript
// Get single track info
await vkMethod(req, "audio.getById", {
  audios: `${owner_id}_${audio_id}`
});

// Get multiple tracks
await vkMethod(req, "audio.getById", {
  audios: `${owner_id1}_${audio_id1},${owner_id2}_${audio_id2}`
});
```

---

### audio.search

**Description**: Returns a list of audio files based on search query.

**Parameters**:
- `q` (string) - Search query string
- `auto_complete` (integer, optional) - 1 — to correct mistakes in search query
- `lyrics` (integer, optional) - 1 — to search only in songs with lyrics
- `performer_only` (integer, optional) - 1 — to search only by performer name
- `sort` (integer, optional) - Sort order:
  - 0 — by popularity
  - 2 — by duration
  - 1 — by date added
- `search_own` (integer, optional) - 1 — to search in user's audio
- `offset` (integer, optional) - Offset for pagination
- `count` (integer, optional) - Number of results (default: 30, max: 300)

**Returns**: Same structure as `audio.get`

**Note**: Not currently used in visky-api but available for future features.

---

### audio.add

**Description**: Adds an audio file to user's library.

**Parameters**:
- `audio_id` (integer) - Audio file ID
- `owner_id` (integer) - ID of the user or community that owns the audio file
- `group_id` (integer, optional) - Community ID (if adding to community)
- `playlist_id` (integer, optional) - Playlist ID to add track to

**Returns**: Audio ID in user's library

**Note**: Currently commented out in visky-api code.

---

### audio.delete

**Description**: Deletes an audio file from user's library.

**Parameters**:
- `audio_id` (integer) - Audio file ID
- `owner_id` (integer) - Audio file owner's ID

**Returns**: 1 on success

**Note**: Currently commented out in visky-api code.

---

### audio.edit

**Description**: Edits an audio file on a user or community page.

**Parameters**:
- `owner_id` (integer) - ID of the user or community that owns the audio file
- `audio_id` (integer) - Audio file ID
- `artist` (string, optional) - Name of the artist
- `title` (string, optional) - Title of the audio file
- `text` (string, optional) - Text of the lyrics
- `genre_id` (integer, optional) - Genre ID
- `no_search` (integer, optional) - 1 — audio file will not be available for search

**Returns**: 1 on success

**Note**: Not currently used in visky-api.

---

### audio.restore

**Description**: Restores a deleted audio file.

**Parameters**:
- `audio_id` (integer) - Audio file ID
- `owner_id` (integer, optional) - ID of the user or community that owns the audio file

**Returns**: Audio object on successful restore

**Note**: Not currently used in visky-api.

---

### audio.reorder

**Description**: Reorders an audio file, placing it between other specified audio files.

**Parameters**:
- `audio_id` (integer) - Audio file ID
- `owner_id` (integer, optional) - ID of the user or community that owns the audio file
- `before` (integer, optional) - ID of the audio file before which to place the audio file
- `after` (integer, optional) - ID of the audio file after which to place the audio file

**Returns**: 1 on success

**Note**: Used for custom playlist ordering. Not currently used in visky-api.

---

### audio.getLyrics

**Description**: Returns lyrics associated with an audio file.

**Parameters**:
- `lyrics_id` (integer) - Lyrics ID (obtained from audio object)

**Returns**: Object with lyrics text
```typescript
{
  lyrics_id: number;
  text: string;  // Lyrics text with line breaks
}
```

**Note**: Not currently used in visky-api.

---

### audio.getCount

**Description**: Returns the total number of audio files on a user or community page.

**Parameters**:
- `owner_id` (integer) - ID of the user or community that owns the audio files

**Returns**: Integer — number of audio files

**Usage Example**:
```typescript
await vkMethod(req, "audio.getCount", {
  owner_id: req.session.user_id
});
// Returns: 1234
```

**Note**: Useful for pagination calculations. Not currently used in visky-api.

---

### audio.getRecommendations

**Description**: Returns a list of suggested audio files based on a user's playlist or a particular audio file.

**Parameters**:
- `target_audio` (string, optional) - Audio file ID in format `{owner_id}_{audio_id}` to get recommendations based on
- `user_id` (integer, optional) - User ID for personalized recommendations
- `offset` (integer, optional) - Offset for pagination
- `count` (integer, optional) - Number of results (default: 100, max: 1000)
- `shuffle` (integer, optional) - 1 — shuffle results

**Returns**: Array of audio objects

**Note**: Great for discovery features. Not currently used in visky-api.

---

### audio.getPopular

**Description**: Returns a list of audio files from the "Popular" section.

**Parameters**:
- `only_eng` (integer, optional) - 1 — return only foreign audio
- `genre_id` (integer, optional) - Genre ID to filter by
- `offset` (integer, optional) - Offset for pagination
- `count` (integer, optional) - Number of results (default: 100, max: 1000)

**Returns**: Array of audio objects

**Note**: Can be used for trending music. Not currently used in visky-api.

---

### audio.setBroadcast

**Description**: Activates an audio broadcast to the status of a user or community.

**Parameters**:
- `audio` (string, optional) - Audio file ID in format `{owner_id}_{audio_id}` to broadcast
- `target_ids` (array, optional) - Community IDs to broadcast to (for community admins)

**Returns**: Array of broadcast status IDs

**Usage Example**:
```typescript
// Broadcast "Now Playing" to user status
await vkMethod(req, "audio.setBroadcast", {
  audio: `${owner_id}_${audio_id}`
});

// Stop broadcasting (call without audio parameter)
await vkMethod(req, "audio.setBroadcast", {});
```

**Note**: Shows "🎵 Listening to..." in user status. Not currently used in visky-api.

---

### audio.getBroadcastList

**Description**: Returns a list of users who are broadcasting music in their statuses.

**Parameters**:
- `filter` (string, optional) - Filter:
  - `friends` — friends only
  - `groups` — communities only
- `active` (integer, optional) - 1 — return only currently active broadcasts

**Returns**: Array of user IDs with their broadcast audio

**Note**: Can show what friends are listening to. Not currently used in visky-api.

---

## Album Management Methods

### audio.getAlbums

**Description**: Returns a list of audio albums of a user or community.

**Parameters**:
- `owner_id` (integer, optional) - ID of the user or community (default: current user)
- `offset` (integer, optional) - Offset for pagination
- `count` (integer, optional) - Number of albums to return (default: 50, max: 100)

**Returns**: Object with album list
```typescript
{
  count: number;
  items: Array<{
    id: number;           // Album ID
    owner_id: number;     // Owner ID
    title: string;        // Album title
    photo: {              // Cover image URLs
      photo_34: string;
      photo_68: string;
      photo_135: string;
      photo_270: string;
      photo_300: string;
      photo_600: string;
    };
    count: number;        // Number of audio files in album
    update_time: number;  // Last update time (Unix timestamp)
    access_key: string;   // Access key for private albums
  }>;
}
```

**Note**: Not currently used in visky-api.

---

### audio.getAlbum

**Description**: Returns information about an audio album (deprecated, use audio.get with playlist_id).

**Parameters**:
- `owner_id` (integer) - ID of the user or community that owns the album
- `album_id` (integer) - Album ID

**Returns**: Album object

**Note**: **Deprecated**. Use `audio.get` with `playlist_id` parameter instead.

---

### audio.addAlbum

**Description**: Creates an empty audio album.

**Parameters**:
- `group_id` (integer, optional) - Community ID (if creating album for community)
- `title` (string) - Album title (max 128 characters)

**Returns**: Object with album ID
```typescript
{
  album_id: number;  // Created album ID
}
```

**Note**: Not currently used in visky-api.

---

### audio.editAlbum

**Description**: Edits the title of an audio album.

**Parameters**:
- `group_id` (integer, optional) - Community ID (if editing community album)
- `album_id` (integer) - Album ID
- `title` (string) - New album title (max 128 characters)

**Returns**: 1 on success

**Note**: Not currently used in visky-api.

---

### audio.deleteAlbum

**Description**: Deletes an audio album.

**Parameters**:
- `group_id` (integer, optional) - Community ID (if deleting from community)
- `album_id` (integer) - Album ID

**Returns**: 1 on success

**Note**: Not currently used in visky-api.

---

### audio.moveToAlbum

**Description**: Moves audio files to an album.

**Parameters**:
- `group_id` (integer, optional) - Community ID
- `album_id` (integer) - Destination album ID
- `audio_ids` (array) - Array of audio file IDs to move

**Returns**: 1 on success

**Usage Example**:
```typescript
await vkMethod(req, "audio.moveToAlbum", {
  album_id: 123456,
  audio_ids: [789012, 345678, 901234]
});
```

**Note**: Not currently used in visky-api.

---

## Upload Methods

### audio.getUploadServer

**Description**: Returns the server address to upload audio files.

**Parameters**: None

**Returns**: Upload server URL
```typescript
{
  upload_url: string;  // URL to POST audio file
}
```

**Upload Process**:
1. Call `audio.getUploadServer` to get upload URL
2. POST audio file to `upload_url` (multipart/form-data)
3. Server returns: `{ server, audio, hash }`
4. Call `audio.save` with returned parameters

**Note**: Not currently used in visky-api (no upload functionality).

---

### audio.save

**Description**: Saves audio files after successful uploading.

**Parameters**:
- `server` (integer) - Server parameter returned from upload server
- `audio` (string) - Audio parameter returned from upload server
- `hash` (string) - Hash parameter returned from upload server
- `artist` (string, optional) - Artist name
- `title` (string, optional) - Track title

**Returns**: Audio object of saved track

**Usage Flow**:
```typescript
// Step 1: Get upload server
const uploadServer = await vkMethod(req, "audio.getUploadServer", {});

// Step 2: Upload file (not shown - requires multipart upload)
// const uploadResponse = await uploadFile(uploadServer.upload_url, audioFile);

// Step 3: Save uploaded audio
const savedAudio = await vkMethod(req, "audio.save", {
  server: uploadResponse.server,
  audio: uploadResponse.audio,
  hash: uploadResponse.hash,
  artist: "Artist Name",
  title: "Track Title"
});
```

**Note**: Not currently used in visky-api (no upload functionality).

---

### audio.createPlaylist

**Description**: Creates a new audio playlist.

**Parameters**:
- `title` (string) - Playlist title
- `owner_id` (integer) - User or community ID (negative for communities)
- `description` (string, optional) - Playlist description

**Returns**: Playlist object with ID

**Usage in visky-api** (commented code):
```typescript
// Create Frisky favorites playlist if not exists
await vkMethod(req, 'audio.createPlaylist', {
  title: "Frisky-favorites",
  owner_id: req.session.user_id
}, true);
```

---

### audio.searchPlaylists

**Description**: Search for playlists by query.

**Parameters**:
- `q` (string) - Search query
- `count` (integer, optional) - Number of results (default: 50, max: 100)
- `offset` (integer, optional) - Offset for pagination

**Returns**: Array of playlist objects

**Note**: Used in commented code for checking if Frisky-favorites playlist exists.

---

### users.get

**Description**: Returns information about users.

**Parameters**:
- `user_ids` (array, optional) - User IDs or screen names (leave empty for current user)
- `fields` (array, optional) - Additional profile fields to return

**Returns**: Array of user objects with `id` field

**Usage in visky-api**: Used in `execute` method queries
```typescript
// Get current user ID for fetching their playlists
API.users.get()[0].id
```

---

## Execute Method

**Description**: Universal method for calling VK API methods with VKScript code.

**Parameters**:
- `code` (string) - VKScript code (JavaScript-like syntax)

**Returns**: Result of code execution

**Usage in visky-api**:
```typescript
const code = `return {
  frisky: API.audio.get({
    count: ${count},
    offset: ${offset},
    owner_id: -42311167
  }),
  favorite: API.audio.get({
    owner_id: API.users.get()[0].id,
    playlist_id: ${playlistId},
    count: ${favoritesCount},
    offset: ${favoritesOffset}
  }),
  playlist: API.audio.get({
    owner_id: API.users.get()[0].id,
    count: ${playlistCount},
    offset: ${playlistOffset}
  })
};`;

await vkMethod(req, 'execute', { code }, true);
```

**Benefits**:
- Reduce API calls by batching multiple requests
- Can combine different methods in single request
- Supports up to 25 API calls per execute

---

## Audio URL Encryption

VK returns encrypted audio URLs in format:
```
https://vk.com/mp3/audio_api_unavailable.mp3?extra={encrypted_data}
```

**Key Points**:
- URL contains `extra` parameter with two parts: encrypted URL and encryption key
- Decryption requires JavaScript execution (unmask algorithm)
- visky-api uses HLS streams directly from VK CDN after successful authentication
- Authentication provides `access_token` and `secret` for signing requests

**Decryption Process** (from Habr article):
1. Parse `extra` parameter
2. Apply XOR with track ID
3. Use unmask algorithm from VK's `audioUnmaskSource()` function
4. Result: direct MP3/M3U8 URL

**Reference**: See [VK-AUDIO-UNMASK.md](./VK-AUDIO-UNMASK.md) for detailed unmask algorithm.

---

## API Version

visky-api uses VK API version **5.131** (configured in `src/constants/index.ts`):
```typescript
export const version = "5.131";
```

**Important**: Audio API methods may change or be removed in newer VK API versions.

---

## Request Signing

All audio API requests require signature when using Android app emulation:

```typescript
// Add signature to URL
const hash = md5(url + req.session.secret);
url += `&sig=${hash}`;
```

**Signature Format**:
```
MD5(request_url + client_secret)
```

**Required Parameters**:
- `access_token` - User's access token
- `device_id` - Random 16-char device identifier
- `sig` - MD5 signature
- `v` - API version

**See Also**: [VK-AUTHENTICATION.md](./VK-AUTHENTICATION.md) for authentication flow details.

---

## Error Handling

Common VK API errors:

| Error Code | Description | Solution |
|------------|-------------|----------|
| 5 | Authorization failed | Re-authenticate user |
| 6 | Too many requests per second | Implement rate limiting |
| 15 | Access denied | Check access_token permissions |
| 201 | Access denied to audio | User privacy settings block access |
| 270 | Audio is removed | Track no longer available |

**Usage in visky-api**:
```typescript
await vkMethod(req, method, params, sign)
  .then(response => response.data)
  .catch(error => {
    console.error(`VK API Error: ${error.error_msg}`);
    throw new Error(error.error_msg);
  });
```

---

## Rate Limits

VK API has rate limits:
- **3 requests per second** for regular methods
- **25 methods per execute** call
- Use `execute` to batch requests when possible

---

## Additional Resources

- [VK API Methods (archive)](https://web.archive.org/web/20170205141608/https://vk.com/dev/methods)
- [VKNet Documentation](https://vknet.github.io/vk/)
- [Audio Token Reference](https://vodka2.github.io/vk-audio-token/)

---

**Last Updated**: December 4, 2025  
**Project**: visky-api  
**API Version**: 5.131
