# Visky Music Player
Player for [Frisky Radio](https://frisky.fm) stored in [Vk Music](https://vk.com/music)

Based on [Music Player](https://github.com/gionathas/music-player)
A native music player application built with Expo, React Native, Typescript and Zustand. 
Design is inspired by Apple Music app

implemented features:
- [x] Oauth Authorization
- [x] Fetching remote playlist tracks
- [x] Fetching user favorites stored on the backend
- [x] Caching playlist
- [x] Merge cached playlist with new compilation
- [ ] Edit part of song (for long compilation), add point for quick navigation
- [ ] Synchronise player state from multiple devices
- [ ] Equalizer for a song or part of song
- [ ] Remove unused volume control bar
- [ ] Shared session with friends (like [Spotify](https://www.spotify.com) party mode)
- [ ] Connection to [Spotify](https://www.spotify.com) or [Apple Music](https://www.apple.com/apple-music)
- [ ] Add music link from [Youtube](https://www.youtube.com) or [Soundcloud](https://soundcloud.com)

## Screenshots
## Installation

```bash
yarn install
```

## Run IOS

```bash
yarn expo run:ios
```

## Run Android

```bash
yarn expo run:android
```
### Known problems
- [ ] On android, compilation ndk problem (default ndkVersion = "21.0.6113669") re
solved with this command
```gradle
buildscript {
    ext {
    ...
        ndkVersion = "26.3.11579264"
    }
    ...
}
```
- [ ] On Android, the player does not work correctly when the application started 