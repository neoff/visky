// src/db/entities/Report.ts
import {Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn} from "typeorm";

/**
 * What somebody told us through the form on the site.
 *
 * THE ROW IS WRITTEN FIRST, before any attempt to mail it or raise an issue,
 * and that order is the whole design. A form whose only sink is an outbound
 * call loses the report whenever the provider is down, the token expired or
 * nobody configured one yet — and the person who typed it has already left.
 * Here the integrations are things that happen TO a report that already exists.
 */
@Entity({name: "reports"})
export class Report {
  /** also the public reference: the form shows it back as VSK-<id> */
  @PrimaryGeneratedColumn("increment")
  id!: number;

  /** "bug" or "feedback" — which form it came from */
  @Index("idx_reports_kind")
  @Column({name: "kind", type: "text"})
  kind!: string;

  @Column({name: "title", type: "text"})
  title!: string;

  @Column({name: "body", type: "text"})
  body!: string;

  /**
   * Optional, and the only personal data here. Never shown on the dashboard:
   * a public list of addresses is the problem the form was built to solve.
   */
  @Column({name: "email", type: "text", nullable: true})
  email?: string | null;

  /** open | closed — moved by hand for now */
  @Column({name: "status", type: "text", default: "open"})
  status!: string;

  /** the issue this became, once a token exists to raise one */
  @Column({name: "github_issue", type: "int", nullable: true})
  githubIssue?: number | null;

  /** what the delivery attempts did, for when one of them quietly stops */
  @Column({name: "delivery", type: "text", nullable: true})
  delivery?: string | null;

  @CreateDateColumn({name: "created_at", type: "timestamptz"})
  createdAt!: Date;
}
