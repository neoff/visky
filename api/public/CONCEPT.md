## Why I'm do that?

### TL;DR
I love frisky radio, but can't listen it every time. So, 
I decided to create a application with the history track list of previously played. 
Frisky radio doesn't provide a public API to get the latest shows track list, 
so...

I found VK (social network) community who once a day save all show to the VK music.
That's a reason to create mobile app for listening played frisky show.

#### Why not a frisky radio app?
![frisku radio logo](https://play-lh.googleusercontent.com/HCc6SsUlQ2vePRe_vXBOhzTAH9C6vxWlKaGo22tKrd2R1zHoNo8oqnpj9SKuz1C5XYRW)
 * Frisky radio app show only currently played shows (or only for a one day).
 * To get access to play previous show i's cost a money.
 * I don't want to duplicate existing app.

#### Why not a VK app?
![VK logo](https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/VK_Compact_Logo_%282021-present%29.svg/1024px-VK_Compact_Logo_%282021-present%29.svg.png)
 * VK app doesn't provide a good music player.
 * To access to the music you need to be online (cant switch to the other application or turn screen off).
 * Access to the music is not free. (because it's for all music in VK, not only for frisky radio, and that not worked outside on russian territory)
 * Doesn't have a picture for the compositions.

### Solutions
Made a player for VK but just for frisky radio community.

#### Solved problems:
 VK remove access to the `audio` API for the third-party applications. the problem is explained 
 on the [Habr](https://habr.com/ru/articles/519302/) (russian IT blog) and workaround how to solve that.
 
#### Why it's separated for front and back?
 * Frontend is a mobile application, tiny client just for listening music.
 * Backend is a server stored and cached playlist, add the images, store compilation playlist and save player statement