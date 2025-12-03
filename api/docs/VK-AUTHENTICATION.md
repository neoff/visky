# VK Authentication Flow (Android App Emulation)

> **Important**: This document describes the authentication method used in visky-api to obtain VK access tokens by emulating an old Android VK application. This is NOT the official OAuth2 flow.

## Sources
- https://habr.com/ru/articles/340810/ - "Тащим музыку из ВК без публичного music API"
- VK API Official Documentation (archived)
- visky-api source code analysis

---

## Overview

visky-api uses a **legacy VK Android app authentication** to bypass Audio API restrictions. This method:
- Emulates VK Android App version 4.13.1-1206
- Uses password grant type (deprecated in modern OAuth2)
- Obtains `access_token`, `secret`, and `user_id`
- Generates random `device_id` for request signing

**Why This Approach?**
- Official VK Audio API was removed from public access
- Modern VK API doesn't support audio methods for third-party apps
- Old Android apps still have access to audio endpoints

---

## Authentication Parameters

### Android App Credentials

Located in `.env` file:
```bash
OFFICIAL_APP_ID=2274003        # Old VK Android app ID
OFFICIAL_APP_SECRET=hHbZxrka2uZ6jB1inYsH  # Old Android app secret
VK_ADMIN_ID=2274003            # Same as app ID
```

### User-Agent Header

**Critical**: All requests must use old Android user-agent:
```
VKAndroidApp/4.13.1-1206 (Android 4.4.3; SDK 19; armeabi; ; ru)
```

This header is configured in `src/helper/index.ts`:
```typescript
const headers = {
  "User-Agent": "VKAndroidApp/4.13.1-1206 (Android 4.4.3; SDK 19; armeabi; ; ru)",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
}

export const AndroidClient = wrapper(axios.create({ headers }));
```

---

## Authentication Flow

### Step 1: Display Auth Page

**Endpoint**: `GET /auth/vk`

**Process**:
1. Fetch VK OAuth page with parameters:
```typescript
const params = {
  client_id: process.env.VK_ADMIN_ID,      // 2274003
  scope: 1,                                 // Basic scope
  redirect_uri: "https://oauth.vk.com/blank.html",
  display: "mobile",                        // Mobile display mode
  lang: "en",
  revoke: 1,                                // Force re-auth
  response_type: "token",
  v: "5.103"                                // API version
}
```

2. Fetch auth page from VK:
```typescript
await AndroidClient.get(AuthUrl, { params })
```

3. **Remove VK's JavaScript protection** (critical step):
```typescript
const callBack = (html: string, url: string) => {
  // Remove event prevention that blocks form submission
  html = html.replace(
    /,window._preventEvents=\["click","touchstart","touchend","mouseover","mousemove"\]/gi, 
    ""
  );
  
  // Remove page reload on submit
  html = html.replace(/&&location.reload\(\)/gi, "");
  
  // Replace form action to POST to our server
  html = html.replace(
    /<form[^>]*>/gi, 
    `<form method="post" action="${url}">`
  );
  
  return html;
}
```

4. Return modified HTML to user for credentials input

---

### Step 2: Submit Credentials

**Endpoint**: `POST /auth/vk`

**Request Body**:
```json
{
  "email": "user@example.com",
  "pass": "user_password"
}
```

**Process**:
1. Prepare token request parameters:
```typescript
const params = {
  client_id: process.env.OFFICIAL_APP_ID,          // 2274003
  client_secret: process.env.OFFICIAL_APP_SECRET,  // hHbZxrka2uZ6jB1inYsH
  grant_type: "password",                          // Password grant (deprecated)
  scope: "nohttps,audio,offline",                  // Critical: audio scope!
  validate_token: "true",
  username: req.body.email,                        // User email
  password: req.body.pass                          // User password
}
```

2. Request token from VK:
```typescript
await AndroidClient.get(TokenUrl, { params })
// TokenUrl = "https://oauth.vk.com/token"
```

3. **Response from VK**:
```json
{
  "access_token": "533bacf01e11f55b536a565b57531ac114461ae8736d6506a3",
  "expires_in": 0,           // 0 = never expires (offline scope)
  "user_id": 123456,
  "secret": "0a12b3c4d5"     // Critical: used for request signing!
}
```

4. Generate device ID and store in session:
```typescript
req.session.secret = data.secret;
req.session.user_id = data.user_id.toString();
req.session.access_token = data.access_token;
req.session.device_id = deviceIDgen();  // Random 16 chars
```

5. Redirect to blank page with success:
```
/blank.html#success=1&access_token={token}&user_id={id}&secret={secret}
```

---

### Step 3: Device ID Generation

**Purpose**: Each device needs unique identifier for VK to track requests.

**Algorithm**:
```typescript
const alphabet = "abcdefghijklmnopqrstuvwxyz0987654321";

export const deviceIDgen = () => {
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}
```

**Example**: `"a7k3m9p2q5r8t1u4"`

**Storage**: Stored in Express session along with access_token and secret.

---

## Request Signing

All API requests to VK must be signed with `sig` parameter.

### Signature Algorithm

**Formula**:
```
sig = MD5(request_url + client_secret)
```

**Implementation** (`src/helper/vk.ts`):
```typescript
export const vkMethod = async (
  req: Request, 
  method: string, 
  params: {}, 
  sign: boolean = false
): Promise<VkResponse> => {
  // Build base URL
  let url = `/method/${method}?v=${version}&access_token=${req.session.access_token}`;
  
  // Add method parameters
  for (const [key, value] of Object.entries(params)) {
    url += `&${key}=${value}`;
  }
  
  // Add device_id and signature
  if (req.session.secret) {
    url += `&device_id=${req.session.device_id}`;
    
    // Calculate MD5 signature
    const hash = md5(url + req.session.secret);
    url += `&sig=${hash}`;
  }
  
  // Make request
  return await AndroidClient.get(`https://api.vk.com${url}`);
}
```

### MD5 Helper

```typescript
export const md5 = (data: string): string => {
  return crypto.createHash('md5').update(data).digest('hex');
}
```

### Example Signed Request

**Method**: `audio.get`  
**Parameters**: `{ count: 100, offset: 0, owner_id: -42311167 }`

**Step 1**: Build URL
```
/method/audio.get?v=5.131&access_token=533bacf...&count=100&offset=0&owner_id=-42311167&device_id=a7k3m9p2q5r8t1u4
```

**Step 2**: Calculate signature
```javascript
const secret = "0a12b3c4d5";
const url = "/method/audio.get?v=5.131&access_token=533bacf...&count=100&offset=0&owner_id=-42311167&device_id=a7k3m9p2q5r8t1u4";
const sig = md5(url + secret);
// sig = "f8e9a1b2c3d4e5f6a7b8c9d0e1f2a3b4"
```

**Step 3**: Final URL
```
https://api.vk.com/method/audio.get?v=5.131&access_token=533bacf...&count=100&offset=0&owner_id=-42311167&device_id=a7k3m9p2q5r8t1u4&sig=f8e9a1b2c3d4e5f6a7b8c9d0e1f2a3b4
```

---

## Session Management

### Session Storage

visky-api uses **express-session** with cookie storage:

```typescript
// Session configuration
{
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7,  // 7 days
    httpOnly: true,
    secure: false  // Set to true in production with HTTPS
  }
}
```

### Session Data Structure

```typescript
interface Session {
  access_token: string;   // VK access token
  secret: string;         // Client secret for signing
  user_id: string;        // VK user ID
  device_id: string;      // Generated device identifier
  cookie: {
    expires: Date;        // Session expiration
  }
}
```

### Authentication Middleware

**Middleware**: `checkAuthAndroid` in `src/helper/vk.ts`

```typescript
export const checkAuthAndroid = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  // Check session OR x-auth-token header
  if (
    (!req.session || !req.session.access_token || !req.session.user_id) 
    && (!req.headers['x-auth-token'])
  ) {
    console.error("ERROR! checkAuth: No token or secret", req.session);
    res.status(403).send(new AxiosError("No token or secret"));
    return;
  }
  next();
}
```

**Usage**: Applied to all `/api/*` routes
```typescript
api.get("/frisky", checkAuthAndroid, async (req, res) => {
  // Route handler
});
```

---

## Security Considerations

### ⚠️ Risks

1. **Password Grant Type**: Deprecated by OAuth2 spec, less secure than authorization code flow
2. **Client Secret Exposure**: Secret is stored in .env, not hardware-protected
3. **Session Hijacking**: Session cookies can be stolen if not using HTTPS
4. **VK ToS Violation**: Emulating Android app may violate VK Terms of Service
5. **Account Ban Risk**: VK may detect and ban accounts using this method

### 🛡️ Mitigations

1. **HTTPS Only**: Always use HTTPS in production
2. **Secure Cookies**: Enable `secure: true` and `httpOnly: true` for cookies
3. **Rate Limiting**: Implement rate limiting to avoid detection
4. **User Warnings**: Inform users about risks before authentication
5. **Session Rotation**: Rotate session IDs periodically
6. **Environment Isolation**: Keep secrets in `.env`, never commit to git

---

## Alternative: Header-Based Auth

visky-api also supports authentication via `x-auth-token` header:

```http
GET /api/playlist/frisky
x-auth-token: {session_token}
```

This allows mobile apps to store token and avoid cookies.

---

## Troubleshooting

### Error: "No token or secret"

**Cause**: Session expired or not authenticated  
**Solution**: Re-authenticate via `/auth/vk`

### Error: "Authorization failed" (VK error code 5)

**Cause**: Invalid access_token or expired session  
**Solution**: 
1. Check if token is valid
2. Verify User-Agent header matches Android app
3. Re-authenticate to get new token

### Error: "Access denied to audio" (VK error code 201)

**Cause**: User privacy settings or insufficient permissions  
**Solution**: 
1. Check `scope` includes `audio`
2. Verify user allowed audio access during auth
3. Ask user to change privacy settings

### Requests not signed properly

**Symptoms**: Random API failures, intermittent errors  
**Cause**: Missing or incorrect signature  
**Solution**:
1. Verify `secret` is stored in session
2. Check MD5 calculation: `md5(url + secret)`
3. Ensure `device_id` is included in URL before signing
4. Debug: Log URL before and after signing

---

## Code References

### Key Files

- `src/router/authForm.ts` - Authentication routes
- `src/helper/vk.ts` - VK API helper and signing
- `src/helper/index.ts` - Android client configuration
- `src/router/middleware/auth.ts` - Auth middleware

### Environment Variables

```bash
# .env file
OFFICIAL_APP_ID=2274003
OFFICIAL_APP_SECRET=hHbZxrka2uZ6jB1inYsH
VK_ADMIN_ID=2274003
SESSION_SECRET=your-random-secret-here
```

---

## Comparison: Official OAuth2 vs Android Emulation

| Feature | Official OAuth2 | Android Emulation |
|---------|----------------|-------------------|
| **Flow** | Authorization Code | Password Grant |
| **Audio API Access** | ❌ Not available | ✅ Available |
| **Security** | ✅ High | ⚠️ Medium |
| **User Experience** | Better (redirect) | Worse (form input) |
| **VK ToS Compliance** | ✅ Compliant | ❌ Violation risk |
| **Token Expiration** | Yes (3600s) | No (offline scope) |
| **Signature Required** | No | ✅ Yes (MD5) |

---

## Future Improvements

1. **Token Refresh**: Implement automatic token refresh before expiration
2. **2FA Support**: Handle two-factor authentication flow
3. **Captcha Handling**: Implement captcha solving for auth
4. **Multi-Account**: Support multiple VK accounts per user
5. **OAuth2 Fallback**: Implement official OAuth2 as fallback when audio access is restored

---

**Last Updated**: December 4, 2025  
**Project**: visky-api  
**Authentication Method**: VK Android App Emulation (Legacy)

**⚠️ Disclaimer**: This authentication method is for educational purposes. Use at your own risk. VK may change or block this method at any time.
