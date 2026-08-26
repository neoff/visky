// src/db/entities/FriskyArtist.ts
import {Column, Entity, Index, PrimaryColumn, UpdateDateColumn} from "typeorm";

/**
 * An artist as frisky.fm knows them (`GET /v3/artists/{id}`).
 *
 * frisky has no search endpoint — `/v3/artists?title=...` is silently ignored —
 * so the whole directory is mirrored once and `key` (the normalised name) is
 * what turns a VK artist string into a frisky artist id.
 */
@Entity({name: "frisky_artists"})
export class FriskyArtist {
  /** frisky's own artist id */
  @PrimaryColumn({name: "id", type: "int"})
  id!: number;

  @Column({name: "title", type: "text", nullable: true})
  title?: string | null;

  /** normalised name — the join column against a VK `artist` field */
  @Index("idx_frisky_artists_key")
  @Column({name: "key", type: "text"})
  key!: string;

  @Column({name: "url", type: "text", nullable: true})
  url?: string | null;

  @Column({name: "genre", type: "jsonb", nullable: true})
  genre?: string[] | null;

  @Column({name: "biography", type: "text", nullable: true})
  biography?: string | null;

  @Column({name: "home_city", type: "text", nullable: true})
  homeCity?: string | null;

  @Column({name: "photo_url", type: "text", nullable: true})
  photoUrl?: string | null;

  @Column({name: "photo_thumb_url", type: "text", nullable: true})
  photoThumbUrl?: string | null;

  @Column({name: "links", type: "jsonb", nullable: true})
  links?: Record<string, string | null> | null;

  @Column({name: "reach", type: "bigint", nullable: true})
  reach?: string | null;

  /** when this row was last read from frisky */
  @Column({name: "fetched_at", type: "timestamptz", nullable: true})
  fetchedAt?: Date | null;

  /** when this artist's mixes were last paged in; null = never */
  @Column({name: "mixes_synced_at", type: "timestamptz", nullable: true})
  mixesSyncedAt?: Date | null;

  @UpdateDateColumn({name: "updated_at", type: "timestamptz"})
  updatedAt!: Date;
}
