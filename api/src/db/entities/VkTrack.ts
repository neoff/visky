// src/db/entities/VkTrack.ts
import {Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn} from "typeorm";

/**
 * The playlist cache: every VK row the API has ever served, minus its audio.
 *
 * `url` IS NOT HERE AND MUST NOT BE. A VK audio link is signed for one token,
 * one device and a short life; persisting it would hand out links that are dead
 * on arrival and would leak one user's signature to another. The stream is
 * always re-read from VK — this table only holds what does not expire (the
 * naming of a track) plus the frisky mix it resolves to.
 */
@Entity({name: "vk_tracks"})
export class VkTrack {
  /** `${owner_id}_${id}` — VK's own addressing, as used everywhere else */
  @PrimaryColumn({name: "track_id", type: "text"})
  trackId!: string;

  @Column({name: "owner_id", type: "bigint"})
  ownerId!: string;

  @Column({name: "audio_id", type: "bigint"})
  audioId!: string;

  /** artist and title AS VK SENT THEM: the cleanup drops the date the match needs */
  @Column({name: "artist", type: "text", nullable: true})
  artist?: string | null;

  @Column({name: "title", type: "text", nullable: true})
  title?: string | null;

  @Column({name: "duration", type: "int", nullable: true})
  duration?: number | null;

  /** VK upload time, unix seconds */
  @Column({name: "date", type: "bigint", nullable: true})
  date?: string | null;

  @Column({name: "artwork", type: "text", nullable: true})
  artwork?: string | null;

  @Index("idx_vk_tracks_artist_key")
  @Column({name: "artist_key", type: "text", nullable: true})
  artistKey?: string | null;

  @Column({name: "title_key", type: "text", nullable: true})
  titleKey?: string | null;

  @Column({name: "period_year", type: "int", nullable: true})
  periodYear?: number | null;

  @Column({name: "period_month", type: "int", nullable: true})
  periodMonth?: number | null;

  @Column({name: "period_day", type: "int", nullable: true})
  periodDay?: number | null;

  /** which part of a multipart show this row is, when it is one */
  @Column({name: "part", type: "int", nullable: true})
  part?: number | null;

  @Column({name: "frisky_mix_id", type: "int", nullable: true})
  friskyMixId?: number | null;

  /** how sure the match is (0..1) — kept so a bad threshold can be re-judged */
  @Column({name: "match_score", type: "real", nullable: true})
  matchScore?: number | null;

  /**
   * pending  — never looked up
   * matched  — resolved to a frisky mix
   * unmatched — looked up and frisky has nothing; retried after a while
   */
  @Index("idx_vk_tracks_match_state")
  @Column({name: "match_state", type: "text", default: "pending"})
  matchState!: "pending" | "matched" | "unmatched";

  @Column({name: "matched_at", type: "timestamptz", nullable: true})
  matchedAt?: Date | null;

  @Column({name: "last_seen", type: "timestamptz", nullable: true})
  lastSeen?: Date | null;

  @CreateDateColumn({name: "created_at", type: "timestamptz"})
  createdAt!: Date;

  @UpdateDateColumn({name: "updated_at", type: "timestamptz"})
  updatedAt!: Date;
}
