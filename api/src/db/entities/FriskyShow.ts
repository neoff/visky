// src/db/entities/FriskyShow.ts
import {Column, Entity, PrimaryColumn, UpdateDateColumn} from "typeorm";

/**
 * A programme — "Tech Coast Tribal", "Hurly Burly" — and, the reason this table
 * exists, ITS ARTWORK.
 *
 * A mix carries no image at all: `/v3/mixes` has no `image` field, only episodes
 * and shows do. So a mix paged in through `/mixes?artists_id=` has nothing to
 * draw with, and the merge used to fall through to the artist's photo — which is
 * a picture of a person where the show's cover belongs.
 */
@Entity({name: "frisky_shows"})
export class FriskyShow {
  @PrimaryColumn({name: "id", type: "int"})
  id!: number;

  @Column({name: "title", type: "text", nullable: true})
  title?: string | null;

  @Column({name: "url", type: "text", nullable: true})
  url?: string | null;

  @Column({name: "summary", type: "text", nullable: true})
  summary?: string | null;

  @Column({name: "channel", type: "text", nullable: true})
  channel?: string | null;

  @Column({name: "genre", type: "jsonb", nullable: true})
  genre?: string[] | null;

  @Column({name: "artist_id", type: "int", nullable: true})
  artistId?: number | null;

  /** the cover: `showmain/...` */
  @Column({name: "image_url", type: "text", nullable: true})
  imageUrl?: string | null;

  /** the small one: `showthumb/...` */
  @Column({name: "thumb_url", type: "text", nullable: true})
  thumbUrl?: string | null;

  @Column({name: "album_art_url", type: "text", nullable: true})
  albumArtUrl?: string | null;

  @Column({name: "fetched_at", type: "timestamptz", nullable: true})
  fetchedAt?: Date | null;

  @UpdateDateColumn({name: "updated_at", type: "timestamptz"})
  updatedAt!: Date;
}
