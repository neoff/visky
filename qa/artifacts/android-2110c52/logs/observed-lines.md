# Log lines read live during the run

Every line below was read from `adb logcat -d -s ReactNativeJS:V` at the moment
the case was driven, and is copied verbatim from that read. The device's
ring buffer was cleared between cases (`qa_android_log_clear`) and has since
rolled, so this file is the record rather than a re-dump.

## A1 / A3 — cold start (two runs)
09-14 12:55:12.956  9586  9637 D ReactNativeJS: ==window songs-window: seeded 49 tracks from cache
09-14 12:55:15.036  9586  9637 D ReactNativeJS: ==window songs-window: pages 0 -> 49 tracks

09-14 12:56:02.727  9769  9821 I ReactNativeJS: --AppLayout=Loading...
09-14 12:56:03.026  9769  9821 I ReactNativeJS: '--AppLayout=Stack session:', '1127108627', 'edfjniaetzl6jypd'
09-14 12:56:03.354  9769  9821 I ReactNativeJS: ===SongsScreenLayout
09-14 12:56:03.404  9769  9821 D ReactNativeJS: ==window songs-window: seeded 49 tracks from cache
09-14 12:56:05.938  9769  9821 D ReactNativeJS: ==window songs-window: pages 0 -> 49 tracks

## B1 — paging forward
09-14 12:57:03.817  9769  9821 D ReactNativeJS: ==window songs-window: pages 0,1 -> 98 tracks
09-14 12:57:11.277  9769  9821 D ReactNativeJS: ==window songs-window: pages 0,1,2 -> 148 tracks
09-14 12:57:16.683  9769  9821 D ReactNativeJS: ==window songs-window: pages 0,1,2,3 -> 197 tracks
09-14 12:57:23.983  9769  9821 D ReactNativeJS: ==window songs-window: pages 1,2,3,4 -> 198 tracks
09-14 12:57:31.181  9769  9821 D ReactNativeJS: ==window songs-window: pages 2,3,4,5 -> 198 tracks
09-14 12:57:32.322  9769  9821 D ReactNativeJS: ==window songs-window: pages 3,4,5,6 -> 198 tracks
09-14 12:57:33.499  9769  9821 D ReactNativeJS: ==window songs-window: pages 4,5,6,7 -> 197 tracks

## B2 — paging back (first index decreases)
09-14 12:58:58.664  9769  9821 D ReactNativeJS: ==window songs-window: pages 3,4,5,6 -> 198 tracks
09-14 13:04:34.968  9769  9821 D ReactNativeJS: ==window songs-window: pages 2,3,4,5 -> 198 tracks   <- the pair B2f-pre/B2f-post brackets this one

## B3 — pull to refresh (log cleared immediately before the gesture)
09-14 13:08:31.013  9769  9821 D ReactNativeJS: ==window songs-window: pages 0 -> 49 tracks

## B5 — search on the server
09-14 13:09:17.571  9769  9821 I ReactNativeJS: GET https://visky.envarg.com/api/playlist/frisky?count=100&offset=0&q=January
09-14 13:09:55.218  9769  9821 I ReactNativeJS: GET https://visky.envarg.com/api/playlist/frisky?count=100&offset=0&q=Hypnology

## C1 — tapping the third row
09-14 13:10:22.996  9769  9821 I ReactNativeJS: 'Playback state: ', 'stopped'
09-14 13:10:23.269  9769  9821 I ReactNativeJS: 'Track changed', undefined
09-14 13:10:23.522  9769  9821 I ReactNativeJS: 'Track changed', 0
09-14 13:10:23.833  9769  9821 I ReactNativeJS: 'Track changed', 29
09-14 13:10:24.073  9769  9821 I ReactNativeJS: 'Track changed', 0
09-14 13:10:24.885  9769  9821 I ReactNativeJS: 'Playback state: ', 'ready'
09-14 13:10:24.886  9769  9821 I ReactNativeJS: 'Playback state: ', 'playing'

## C3 — manual skip (tap at 13:15:11.506; shots k1..k4 span .506 -> 12.640)
09-14 13:15:11.668  9769  9821 I ReactNativeJS: 'Track changed', 1
09-14 13:15:11.669  9769  9821 I ReactNativeJS: 'Playback state: ', 'loading'
09-14 13:15:11.670  9769  9821 I ReactNativeJS: 'Playback state: ', 'buffering'
09-14 13:15:14.104  9769  9821 I ReactNativeJS: 'Playback state: ', 'ready'
09-14 13:15:14.201  9769  9821 I ReactNativeJS: 'Playback state: ', 'playing'

## C4 — automatic hand-over (log cleared 13:16:0x, track seeked to -00:41)
09-14 13:16:55.956  9769  9821 I ReactNativeJS: 'Track changed', 2
09-14 13:16:56.046  9769  9821 I ReactNativeJS: 'Playback state: ', 'loading'
09-14 13:16:56.047  9769  9821 I ReactNativeJS: 'Playback state: ', 'ready'
09-14 13:16:56.048  9769  9821 I ReactNativeJS: 'Playback state: ', 'playing'
(no ==prefetch line anywhere in the cleared window)

## C7 — a track runs out, another is skipped at its midpoint
09-14 13:20:26.394  9769  9821 I ReactNativeJS: 'Track changed', 3     <- Waves Part 2 ran out
09-14 13:22:52.822  9769  9821 I ReactNativeJS: 'Track changed', 4     <- Dark to light skipped at 30:10 / 59:57

## C8 — last track of the queue
09-14 13:31:54.485  9769 14005 I ReactNativeJS: 'Track changed', 22    <- index 22 of a 23-track queue
09-14 13:32:32.865  9769 14005 I ReactNativeJS: 'Playback state: ', 'ended'
(no 'Track changed' after it — nothing else could have marked the track)

## D4 — launch intent
Starting: Intent { act=android.intent.action.MAIN cat=[android.intent.category.LAUNCHER] cmp=com.envarg.visky/.MainActivity }
Warning: Activity not started, its current task has been brought to the front
  mCurrentFocus=Window{7d2d34f u0 com.envarg.visky/com.envarg.visky.MainActivity}
