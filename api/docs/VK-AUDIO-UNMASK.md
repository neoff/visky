# VK Audio URL Decryption (Unmask Algorithm)

> **Note**: visky-api currently uses HLS streams directly from VK CDN after authentication and does NOT implement URL unmasking. This document is for reference purposes based on research from Habr articles.

## Sources
- https://habr.com/ru/articles/340810/ - "Тащим музыку из ВК без публичного music API"
- VK Web Player JavaScript (audioplayer.js, common.js)
- Commit from Dec 17, 2017: XOR encryption with track ID

---

## Problem Overview

VK encrypts direct audio URLs to prevent unauthorized access and downloading. Instead of returning direct MP3/M3U8 links, VK Audio API returns:

```
https://vk.com/mp3/audio_api_unavailable.mp3?extra={encrypted_data}
```

**Example**:
```
https://vk.com/mp3/audio_api_unavailable.mp3?extra=ofvLohaZvtDKnOPmEtHWl2rJCLLMrJiZy1i4D3blohn4AZLflLqZtMn3utbJmeTrCdq2Be1LyJ1HDvqTBKnUne8YrJfzzKrVENKXzL9JmMHgEgz3u3nbDwfuBMDiywLJBOrfl2fQwJDRmvrFzwDbwtGWvwThDxy6lxLHt1KOlvDODhbTAgjOzffOzdvTBOvOms9nvO9Ix1bxrNqUwgnfAfLW
```

---

## Encryption Components

### 1. Extra Parameter Structure

The `extra` parameter contains **two parts** separated by `?`:

```
{encrypted_url}?{encryption_key}
```

**Example breakdown**:
```
Part 1 (encrypted_url): ofvLohaZvtDKnOPmEtHWl2rJCLLMrJiZy1i4D3blohn4AZLflLqZtMn3...
Part 2 (encryption_key): some_key_data
```

### 2. VK JavaScript Function

VK's web player uses JavaScript function `audioUnmaskSource()` to decrypt URLs.

**From Habr article investigation**:
1. User clicks play button
2. `getAudioPlayer().toggleAudio(this, event)` is called
3. Eventually calls `audioUnmaskSource(encrypted_url)`
4. Returns decrypted direct URL

---

## Decryption Algorithm (2017 Update)

### Background

On **December 17, 2017**, VK updated the masking algorithm. The new version:
- XORs the encrypted data with track ID
- Changes scrambling pattern
- Makes reverse-engineering harder

### High-Level Steps

1. **Parse `extra` parameter** into two parts
2. **Base64 decode** (or similar encoding) the encrypted URL
3. **XOR with track ID**: Apply XOR operation using `{owner_id}_{audio_id}`
4. **Apply unmask algorithm**: VK's proprietary scrambling/unscrambling
5. **Result**: Direct CDN URL

### Pseudocode (Conceptual)

```javascript
function audioUnmaskSource(maskedUrl, trackId) {
  // Step 1: Parse extra parameter
  const [encryptedPart, keyPart] = parseExtra(maskedUrl);
  
  // Step 2: Decode base64 or custom encoding
  const decodedData = decodeEncryptedPart(encryptedPart);
  
  // Step 3: XOR with track ID
  const xorKey = generateXorKey(trackId); // trackId = "123456_789012"
  const xoredData = xorOperation(decodedData, xorKey);
  
  // Step 4: Apply VK's unmask algorithm
  const unmaskedUrl = vkUnmaskAlgorithm(xoredData, keyPart);
  
  // Step 5: Return direct URL
  return unmaskedUrl;
  // Example result: "https://psv4.vkuseraudio.net/..."
}
```

---

## XOR Operation Details

### Track ID Format

```
{owner_id}_{audio_id}
```

**Example**: `"456239119_123456789"`

### XOR Process

```javascript
function xorOperation(data, trackId) {
  const key = trackId.toString();
  let result = '';
  
  for (let i = 0; i < data.length; i++) {
    const dataChar = data.charCodeAt(i);
    const keyChar = key.charCodeAt(i % key.length);
    result += String.fromCharCode(dataChar ^ keyChar);
  }
  
  return result;
}
```

**Note**: This is a simplified example. Actual VK implementation may differ.

---

## VK Unmask Algorithm (Proprietary)

The exact unmask algorithm is **proprietary and changes frequently**. From Habr article research:

### Known Characteristics

1. **Character shuffling**: Rearranges characters based on key
2. **Substitution cipher**: Replaces characters using lookup table
3. **Multiple passes**: May apply transformation multiple times
4. **Key dependency**: Algorithm behavior depends on `keyPart` from extra parameter

### Observed Pattern (2017)

```javascript
// WARNING: This is reverse-engineered and may be outdated
function vkUnmaskAlgorithm(xoredData, key) {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=";
  
  // Step 1: Reverse character positions based on key
  let step1 = reversePositions(xoredData, key);
  
  // Step 2: Substitute characters
  let step2 = substituteChars(step1, alphabet);
  
  // Step 3: Decode final URL
  let finalUrl = decodeUrl(step2);
  
  return finalUrl;
}
```

---

## Decrypted URL Format

After successful decryption, the result is a direct CDN URL:

```
https://psv4.vkuseraudio.net/c123456/u789012/audios/abc123def456.mp3
```

Or HLS stream:
```
https://psv4.vkuseraudio.net/c123456/u789012/audios/abc123def456.m3u8
```

**Components**:
- `psv4.vkuseraudio.net` - VK audio CDN domain
- `c123456` - CDN server ID
- `u789012` - User ID
- `audios/` - Path to audio files
- `abc123def456.mp3` - File hash/identifier

---

## Why visky-api Doesn't Unmask URLs

### Current Approach

visky-api uses **authenticated VK API calls** which return:
1. **Pre-decrypted URLs** when using signed requests with `secret`
2. **HLS streams** directly from VK CDN
3. **Valid URLs** for authenticated sessions

### Benefits

✅ **Simpler**: No need to reverse-engineer VK's changing algorithm  
✅ **More Reliable**: VK provides decrypted URLs when properly authenticated  
✅ **Lower Maintenance**: No need to update unmask algorithm on VK changes  
✅ **Better Quality**: Access to HLS streams with adaptive bitrate  

### Code Evidence

In `src/router/api/playlist.ts`:
```typescript
const response = vkResponse.response as VkPlaylistResponse;
// VK returns response with working URLs when authenticated
const clean = cleanupDataAndSortPart(response);
return formatPlaylist(clean, offset);
```

No URL unmasking is performed - VK API returns ready-to-use URLs.

---

## When URL Unmasking is Needed

### Use Cases

1. **Unauthenticated Scraping**: Parsing VK web pages without login
2. **Public Playlists**: Accessing audio from public VK groups without API
3. **Backup/Archival**: Downloading audio for offline storage
4. **Third-party Players**: Direct URL needed for external players

### Example Projects Using Unmask

From Habr article:
- [vk_music.js](https://bitbucket.org/kitsune_desu/scripts/src/bef47d2c3c917fba64efbd3644758065acdd6a3c/vk_music.js) - Node.js implementation
- Various browser extensions for downloading VK audio

---

## VK's Protection Evolution

### Timeline

| Date | Change | Impact |
|------|--------|--------|
| **2015** | Simple Base64 encoding | Easy to decode |
| **Dec 2017** | XOR with track ID | Harder to reverse-engineer |
| **2018+** | Multiple algorithm versions | Different users see different algorithms |
| **2020+** | Server-side validation | URLs expire quickly |
| **2024+** | Enhanced protection | Frequent algorithm changes |

### Current Status (2024-2025)

- ✅ **Authenticated API**: Still works with Android app emulation
- ⚠️ **Web Scraping**: Harder due to dynamic JavaScript
- ❌ **Simple Unmask**: No longer works without updates
- ✅ **HLS Streams**: Preferred delivery method

---

## Alternative: Direct VK Web API

### al_audio.php Endpoint

From Habr article investigation, VK uses internal endpoint:

```http
POST https://vk.com/al_audio.php
Content-Type: application/x-www-form-urlencoded

act=reload_audio&al=1&ids=456239119_123456789
```

**Response**:
```
4089188939145<!><!>0<!>6854<!>0<!><!json>[[456239119,123456789,"https://vk.com/mp3/audio_api_unavailable.mp3?extra=..."]]
```

**Notes**:
- Returns masked URLs
- Requires VK session cookies
- Not officially documented
- May change without notice

---

## Security Implications

### Why VK Encrypts URLs

1. **Copyright Protection**: Prevent direct linking and downloading
2. **Traffic Control**: Force users through VK infrastructure
3. **Monetization**: Control access to audio content
4. **User Tracking**: Monitor audio consumption patterns

### Legal Considerations

⚠️ **Warning**: Unmasking VK audio URLs may violate:
- VK Terms of Service
- Copyright laws (depending on jurisdiction)
- DMCA and similar regulations

**Recommendation**: Use official VK API when possible.

---

## Implementation Reference (Historical)

### JavaScript Example (2017)

From Habr article comments:

```javascript
// WARNING: Outdated and may not work
function unmaskUrl(url) {
  const extra = url.split('?extra=')[1];
  if (!extra) return url;
  
  const parts = extra.split('?');
  const encryptedUrl = parts[0];
  const key = parts[1] || '';
  
  // Decode and unmask
  let decoded = atob(encryptedUrl); // Base64 decode
  let unmasked = '';
  
  for (let i = 0; i < decoded.length; i++) {
    const char = decoded.charCodeAt(i);
    const keyChar = key.charCodeAt(i % key.length);
    unmasked += String.fromCharCode(char ^ keyChar);
  }
  
  return unmasked;
}
```

**Status**: 🔴 **DEPRECATED** - Do not use in production

---

## Recommended Approach for visky-api

### Current Best Practice

✅ **Use authenticated VK API**:
```typescript
const response = await vkMethod(req, "audio.get", {
  count: 100,
  offset: 0,
  owner_id: -42311167
}, false);

// response.items[].url contains WORKING HLS stream URL
// No unmasking needed!
```

### Why This Works

1. **Proper Authentication**: Android app emulation provides valid session
2. **Signed Requests**: MD5 signature validates request authenticity
3. **VK Trust**: VK recognizes "Android app" and returns real URLs
4. **HLS Format**: Modern adaptive streaming (better than MP3)

---

## Future-Proofing

### If Unmask Becomes Necessary

1. **Monitor VK Updates**: Track changes to web player JavaScript
2. **Community Resources**: Check GitHub for updated unmask implementations
3. **Fallback Strategy**: Keep authenticated API as primary method
4. **User Notification**: Inform users if URLs become unavailable

### Resources to Watch

- [vk-audio-token](https://vodka2.github.io/vk-audio-token/) - Community documentation
- [VK API Community](https://vk.com/dev) - Official developer community
- Habr Articles - Russian tech blog with VK research

---

## Conclusion

**For visky-api**: URL unmasking is **NOT REQUIRED** because:
- ✅ Authenticated API returns working URLs
- ✅ HLS streams work directly in React Native TrackPlayer
- ✅ No need to reverse-engineer VK's changing algorithm
- ✅ More reliable and maintainable approach

**This document serves as**:
- 📚 Historical reference
- 🔍 Understanding VK's protection mechanisms
- 🛠️ Fallback knowledge if API access is lost

---

**Last Updated**: December 4, 2025  
**Status**: Reference Only (Not Implemented)  
**Project**: visky-api  

**⚠️ Legal Disclaimer**: This document is for educational purposes only. Unmasking VK audio URLs may violate terms of service and copyright laws. Use at your own risk.
