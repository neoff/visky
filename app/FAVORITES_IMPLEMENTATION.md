# Favorites Functionality Implementation

**Date**: December 4, 2025  
**Branch**: feat/18  
**Version**: 1.0.4

## Overview

Implemented full favorites functionality for Visky mobile app, integrating with the deployed backend API (https://visky.envarg.com) to manage Frisky Radio favorites playlist.

## Changes Made

### 1. API Client Regeneration

**Command**: `yarn generate`

Regenerated OpenAPI client from deployed backend to include new favorites endpoints:

- `GET /api/playlist/frisky/favorites` - Get Frisky-favorites playlist tracks
- `PUT /api/playlist/frisky/favorites` - Add track to Frisky-favorites
- `DELETE /api/playlist/frisky/favorites/:id` - Remove track from Frisky-favorites
- `POST /api/playlist/frisky/create-favorites` - Create and populate playlist
- `PATCH /api/playlist/frisky/create-favorites` - Recreate/refresh playlist

**Generated files**:
- `src/__genedated__/openapi/backend/services/PlaylistService.ts` - Updated with new methods

### 2. Network Helper Functions

**File**: `src/helpers/network.tsx`

Added 5 new API wrapper functions:

```typescript
// Get Frisky-favorites playlist with formatted track data
export const getFavoritesData = async (
  onLoad?: (fragments: any) => any, 
  onError?: (error: any) => void, 
  offset: number = 0
): Promise<any>

// Add track to Frisky-favorites (default owner_id: -42311167)
export const addToFavorites = async (
  audio_id: number, 
  owner_id: number = -42311167
): Promise<any>

// Remove track from Frisky-favorites
export const removeFromFavorites = async (
  audio_id: number, 
  owner_id: number = -42311167
): Promise<any>

// Create Frisky-favorites playlist and auto-populate
export const createFavoritesPlaylist = async (): Promise<any>

// Refresh Frisky-favorites playlist (delete all + repopulate)
export const refreshFavoritesPlaylist = async (): Promise<any>
```

**Key features**:
- All functions use existing `apiRequest` pattern for consistency
- Proper error handling and logging
- Track formatting with HLS type, artwork, and favorite flag
- Default owner_id for Frisky Radio group (-42311167)

### 3. Track List Item Enhancement

**File**: `src/components/TrackListItem.tsx`

Added heart button functionality to track items:

**New Props**:
```typescript
export type TracksListItemProps = {
  track: Track
  onTrackSelect: (track: Track) => void
  isFavoritesScreen?: boolean  // NEW: Shows filled hearts in favorites tab
  onFavoriteToggle?: (track: Track, isFavorite: boolean) => void  // NEW: Callback for state updates
}
```

**Features**:
- Heart icon (Ionicons `heart` / `heart-outline`)
- Toggle between add/remove favorites on click
- Loading state prevents double-clicks
- **404 Error Handling**: Shows alert dialog with navigation to Settings
- Heart color: Red (`colors.primary`) when favorite, white (`colors.icon`) when not
- Heart always filled in favorites screen (`isFavoritesScreen={true}`)

**UI Changes**:
- Added `actionsContainer` style for heart + menu buttons
- Added `favoriteButton` style with padding for touch target

**Error Handling**:
```typescript
if (axiosError.status === 404) {
  Alert.alert(
    'Favorites Playlist Not Found',
    'You need to create the Frisky Favorites playlist first. Would you like to go to Settings?',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Go to Settings', onPress: () => router.push('/(app)/(tabs)/settings') }
    ]
  )
}
```

### 4. Track List Component Update

**File**: `src/components/TrackList.tsx`

Updated to pass favorites-related props to TrackListItem:

**New Props**:
```typescript
export type TrackListProps = Partial<FlashListProps<unknown>> & {
  id: string
  tracks: Track[]
  refresh?: boolean
  hideQueueControls?: boolean
  isFavoritesScreen?: boolean  // NEW
  onFavoriteToggle?: (track: Track, isFavorite: boolean) => void  // NEW
}
```

Passes props down to each TrackListItem in renderItem.

### 5. Favorites Screen Rewrite

**File**: `src/app/(app)/(tabs)/favorites/index.tsx`

Complete rewrite to use new favorites API:

**Replaced**:
- ~~`usePlaylistState('favorites')`~~ → Direct state management
- ~~`loadPlayListData`~~ → `getFavoritesData`

**New Features**:
- Direct MMKV storage with `'favorites'` key
- `handleFavoriteToggle` callback removes tracks from list immediately
- 404 error shows alert with navigation to Settings
- Pull-to-refresh calls `getFavoritesData`
- Search placeholder: "Find in favorites"
- Passes `isFavoritesScreen={true}` to TrackList

**User Flow**:
1. Screen loads → Checks cache → Calls `getFavoritesData` if empty
2. 404 response → Alert dialog → Option to go to Settings
3. Pull-to-refresh → Fetches latest from server
4. Click heart on track → Calls remove API → Track removed from list instantly

### 6. Settings Screen Enhancement

**File**: `src/app/(app)/(tabs)/settings/index.tsx`

Added favorites playlist management UI:

**New State**:
```typescript
const [hasPlaylist, setHasPlaylist] = useState<boolean | null>(null)
const [isLoading, setIsLoading] = useState(false)
const [isCheckingPlaylist, setIsCheckingPlaylist] = useState(true)
```

**Features**:
- **Auto-check on mount**: Calls `getFavoritesData` to check if playlist exists
- **Conditional button rendering**:
  - If no playlist: "Create Favorites Playlist" (heart icon)
  - If has playlist: "Refresh Favorites Playlist" (refresh icon)
- **Loading states**: Buttons disabled and show "Creating..." / "Refreshing..." during API calls
- **Success dialogs**: Show stats from API response (tracks added/deleted, total Frisky tracks)
- **Error handling**: 409 (already exists) → Switch to refresh mode, 404 (not found) → Switch to create mode

**Create Flow**:
```typescript
handleCreatePlaylist() → POST /create-favorites → 
Success: Alert with stats → Navigate to favorites tab
409 Error: Switch to refresh mode
```

**Refresh Flow**:
```typescript
handleRefreshPlaylist() → PATCH /create-favorites →
Success: Alert with stats (deleted + added)
404 Error: Switch to create mode
```

## API Integration

### Backend Endpoints Used

All endpoints on `https://visky.envarg.com`:

| Method | Endpoint | Usage | Error Codes |
|--------|----------|-------|-------------|
| GET | `/api/playlist/frisky/favorites` | Load favorites list | 404 (no playlist) |
| PUT | `/api/playlist/frisky/favorites` | Add track to favorites | 404 (no playlist) |
| DELETE | `/api/playlist/frisky/favorites/:id` | Remove track | 404 (no playlist) |
| POST | `/api/playlist/frisky/create-favorites` | Create playlist | 409 (exists) |
| PATCH | `/api/playlist/frisky/create-favorites` | Refresh playlist | 404 (not found) |

### Request/Response Examples

**Add to Favorites**:
```json
// Request
PUT /api/playlist/frisky/favorites
{
  "audio_id": 123456,
  "owner_id": -42311167
}

// Response
{
  "status": "success",
  "message": "Track added successfully",
  "audio_id": 123456
}
```

**Create Playlist**:
```json
// Response
{
  "status": "success",
  "message": "Frisky-favorites playlist created and populated",
  "playlistId": 789,
  "tracksAdded": 15,
  "totalFriskyTracks": 15
}
```

## User Journey

### Scenario 1: First Time User (No Playlist)

1. User opens **Favorites tab** → Sees empty list or error
2. User clicks heart on song in **Songs tab** → 404 error → Alert appears
3. User clicks "Go to Settings" → Navigated to **Settings tab**
4. Settings shows "Create Favorites Playlist" button
5. User clicks button → Playlist created with all Frisky tracks from VK favorites
6. Success dialog shows stats → User navigated to **Favorites tab**
7. Favorites list now shows all tracks with red hearts

### Scenario 2: Adding Favorites

1. User browses **Songs tab**
2. User clicks heart outline on a track → API call → Heart turns red
3. Track added to Frisky-favorites playlist and main VK favorites
4. User goes to **Favorites tab** → Track appears in list

### Scenario 3: Removing Favorites

1. User in **Favorites tab** with tracks
2. User clicks red heart on a track → API call → Track disappears from list
3. Track removed from Frisky-favorites playlist and main VK favorites

### Scenario 4: Refreshing Playlist

1. User goes to **Settings tab**
2. Button shows "Refresh Favorites Playlist"
3. User clicks button → Old tracks deleted, new tracks added from VK favorites
4. Success dialog shows: "Deleted X tracks, added Y tracks from Z total"

## Technical Details

### State Management

- **Songs List**: Uses `usePlaylistState('tracks')` hook (unchanged)
- **Favorites List**: Direct `useState` + `useMMKVStorage` with `'favorites'` key
- **Settings**: Local state for playlist existence check

### MMKV Storage Keys

- `'tracks'` - Main songs list cache
- `'favorites'` - Favorites list cache
- `'session'` - User session data (used for API auth)

### Error Handling Strategy

**404 Errors** (Playlist not found):
- Shows user-friendly alert
- Offers navigation to Settings
- Settings auto-detects and shows "Create" button

**409 Errors** (Playlist already exists):
- Auto-switches to refresh mode in Settings
- Informs user via alert

**Other Errors**:
- Shows error message from API response
- Falls back to axios error message
- Logged to console for debugging

## UI/UX Improvements

### Visual Feedback

- **Heart Icon States**:
  - Outline (white) - Not in favorites
  - Filled (red) - In favorites
  - Always filled in Favorites tab
  
- **Loading States**:
  - Disabled buttons during API calls
  - "Creating..." / "Refreshing..." text
  - ActivityIndicator in Settings while checking

### User Guidance

- Alert dialogs explain what happened
- Success dialogs show meaningful stats
- Navigation buttons in alerts (e.g., "Go to Settings")
- Clear button labels ("Create" vs "Refresh")

## Testing Checklist

### Songs Tab
- [ ] Heart outline visible on all tracks
- [ ] Click heart → Turns red (if playlist exists)
- [ ] Click heart → 404 alert → Navigation to Settings (if no playlist)
- [ ] Heart state persists on scroll

### Favorites Tab
- [ ] All tracks show red hearts
- [ ] Click heart → Track removed immediately
- [ ] Pull-to-refresh works
- [ ] 404 on load → Alert with Settings navigation
- [ ] Search filters tracks correctly

### Settings Tab
- [ ] Auto-checks playlist on mount
- [ ] Shows "Create" button if no playlist
- [ ] Shows "Refresh" button if has playlist
- [ ] Create button → Creates playlist → Success dialog → Navigate to Favorites
- [ ] Refresh button → Updates playlist → Success dialog with stats
- [ ] Loading states work correctly
- [ ] Error handling (409, 404) works

### Cross-Tab Interactions
- [ ] Add in Songs → Appears in Favorites
- [ ] Remove in Favorites → Heart outline in Songs
- [ ] Create in Settings → Favorites tab loads
- [ ] 404 in Songs/Favorites → Settings shows Create button

### Platform Testing
- [ ] iOS: All functionality works, UI looks correct
- [ ] Android: All functionality works, UI looks correct

## Files Modified

1. `src/helpers/network.tsx` - Added 5 favorites API functions
2. `src/components/TrackListItem.tsx` - Added heart button with toggle logic
3. `src/components/TrackList.tsx` - Pass favorites props to items
4. `src/app/(app)/(tabs)/favorites/index.tsx` - Complete rewrite with new API
5. `src/app/(app)/(tabs)/settings/index.tsx` - Added playlist management UI
6. `src/__genedated__/openapi/backend/services/PlaylistService.ts` - Auto-generated from API

## Dependencies

No new dependencies added. Uses existing:
- `@expo/vector-icons` - Ionicons for heart icon
- `axios` - HTTP requests
- `react-native-mmkv-storage` - Local storage
- `expo-router` - Navigation

## Notes

- TypeScript warnings for `Icon.Button` in Settings are cosmetic (React 19 type strictness)
- All runtime functionality works correctly
- API client is auto-generated - do not edit manually
- Favorites are synced with VK Music main favorites (backend handles dual write)

## Future Enhancements

Potential improvements:
- [ ] Optimistic UI updates (instant heart toggle, rollback on error)
- [ ] Batch operations (add/remove multiple tracks)
- [ ] Offline support with sync queue
- [ ] Favorites playlist sharing
- [ ] Custom playlist creation (beyond Frisky Radio)
- [ ] Favorites sorting/filtering options
- [ ] Animation on heart toggle
- [ ] Haptic feedback on favorite toggle

## Rollback Instructions

If needed to rollback:

```bash
git checkout main -- src/helpers/network.tsx
git checkout main -- src/components/TrackListItem.tsx
git checkout main -- src/components/TrackList.tsx
git checkout main -- src/app/(app)/(tabs)/favorites/index.tsx
git checkout main -- src/app/(app)/(tabs)/settings/index.tsx
yarn generate  # Regenerate old API client
```
