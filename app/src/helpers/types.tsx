import { Dispatch, SetStateAction } from "react";
import { Track } from 'react-native-track-player';

export type Playlist = {
	name: string
	tracks: Track[]
	artworkPreview: string
}

export type Artist = {
	name: string
	tracks: Track[]
}

export type ApiResponseType = {
	count: number,
	items: TrackWithPlaylist[]
}

/*export interface TrackWithPlaylist extends Track {
	url: string,
	id: number, 
	date?: number,
	playlist?: string[]
}*/
//export type TrackWithPlaylist = Omit<Track, 'date'> & {  }
export type TrackWithPlaylist = Track & {
	playlist?: string[]
	album?: {
		[key: string]: any;
	}
}

export interface UserProps {
  user: {
    name: string;
    username: string;
    avatar: string
  } | undefined,
}
export interface LoginProps {
  user: UserProps,
  setUser: Dispatch<SetStateAction<UserProps>>,
}

