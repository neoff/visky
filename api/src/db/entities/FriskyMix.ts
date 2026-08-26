// src/db/entities/FriskyMix.ts
import {Column, Entity, Index, PrimaryColumn, UpdateDateColumn} from "typeorm";

/**
 * One broadcast as frisky.fm describes it (`GET /v3/mixes?artists_id=...`):
 * the tracklist, the genres, the show it belongs to.
 *
 * `mix_url` / `mix_url_64k` are deliberately NOT stored. Audio always comes
 * from VK — the app plays the VK stream and nothing else — so keeping a second
 * set of media links here would only invite something to play the wrong one.
 *
 * `artist_key` + `title_key` + `period_year`/`period_month` are the match
 * surface; see helper/friskyMatch.ts for why those three and not an id.
 */
@Entity({name: "frisky_mixes"})
export class FriskyMix {
  /** frisky's own mix id */
  @PrimaryColumn({name: "id", type: "int"})
  id!: number;

  @Column({name: "title", type: "text", nullable: true})
  title?: string | null;

  @Column({name: "url", type: "text", nullable: true})
  url?: string | null;

  @Index("idx_frisky_mixes_artist")
  @Column({name: "artist_id", type: "int", nullable: true})
  artistId?: number | null;

  @Index("idx_frisky_mixes_artist_key")
  @Column({name: "artist_key", type: "text"})
  artistKey!: string;

  @Column({name: "artist_title", type: "text", nullable: true})
  artistTitle?: string | null;

  /** sorted, normalised words of the show title — see friskyMatch.titleKey */
  @Index("idx_frisky_mixes_title_key")
  @Column({name: "title_key", type: "text"})
  titleKey!: string;

  @Column({name: "period_year", type: "int", nullable: true})
  periodYear?: number | null;

  @Column({name: "period_month", type: "int", nullable: true})
  periodMonth?: number | null;

  @Column({name: "period_day", type: "int", nullable: true})
  periodDay?: number | null;

  /**
   * The exact moment the mix aired, read out of the `url` slug
   * (`el-reyalto-at-08-14-2026`). The title only says "August 2026", and a
   * weekly show has four of those — this is what tells them apart.
   */
  @Column({name: "air_date", type: "timestamptz", nullable: true})
  airDate?: Date | null;

  @Column({name: "show_id", type: "int", nullable: true})
  showId?: number | null;

  @Column({name: "show_title", type: "text", nullable: true})
  showTitle?: string | null;

  /**
   * The broadcast this mix is a piece of. SEVERAL mixes share one episode, and
   * the tracklist often sits on only one of them — so metadata is merged across
   * the episode, not read off a single mix.
   */
  @Index("idx_frisky_mixes_episode")
  @Column({name: "episode_id", type: "int", nullable: true})
  episodeId?: number | null;

  @Column({name: "episode_title", type: "text", nullable: true})
  episodeTitle?: string | null;

  /** the episode's own air date — authoritative, unlike the slug */
  @Column({name: "air_start", type: "timestamptz", nullable: true})
  airStart?: Date | null;

  @Column({name: "genre", type: "jsonb", nullable: true})
  genre?: string[] | null;

  /** `[{title, artist}, ...]` exactly as frisky serves it */
  @Column({name: "track_list", type: "jsonb", nullable: true})
  trackList?: Array<{title?: string; artist?: string}> | null;

  @Column({name: "artwork", type: "text", nullable: true})
  artwork?: string | null;

  @Column({name: "reach", type: "bigint", nullable: true})
  reach?: string | null;

  @Column({name: "favorite_count", type: "int", nullable: true})
  favoriteCount?: number | null;

  @Column({name: "fetched_at", type: "timestamptz", nullable: true})
  fetchedAt?: Date | null;

  @UpdateDateColumn({name: "updated_at", type: "timestamptz"})
  updatedAt!: Date;
}
