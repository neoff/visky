# VK Audio API Reference

> **Important**: VK removed official Audio API documentation from public access. This document preserves API methods used in visky-api project.

## Sources
- https://vodka2.github.io/vk-audio-token/ - VK Audio Token API reference (archived)
- https://web.archive.org/web/20170205141608/https://vk.com/dev/audio - Old VK official documentation (archived)
- https://vknet.github.io/vk/ - VKNet library documentation
- https://habr.com/ru/articles/340810/ - "Тащим музыку из ВК без публичного music API"
- https://habr.com/ru/articles/250379/ - "VkPlaylistServer — добавляем музыку из ВКонтакте в почти любой аудиоплеер"

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
