// src/services/reports.ts
//
// What happens to a bug report between the form and somebody reading it.
//
// The row is written FIRST and the integrations run after, best effort. That
// ordering is deliberate: mail providers rate-limit, tokens expire, and this
// project had neither configured on the day the form shipped. A report that
// exists in our own database is a report that can be delivered late; one that
// only ever existed inside a failed outbound call is gone, and the person who
// typed it has closed the tab.
import {initDataSource} from "@/configurations/typeorm.config";
import {db} from "@/configurations/playback";
import {Report} from "@/db/entities/Report";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "neoff/visky";
const RESEND_KEY = process.env.RESEND_API_KEY || "";
const MAIL_TO = process.env.REPORT_MAIL_TO || "";
const MAIL_FROM = process.env.REPORT_MAIL_FROM || "visky <noreply@envarg.com>";

/**
 * "tester" is the closed-beta signup, and it is NOT a report. It shares this
 * pipeline because it needs exactly what a report needs — a row written before
 * anything outbound is attempted, and a mail to the owner — but it carries an
 * address that is the whole point of the submission rather than an optional
 * extra, so it never reaches GitHub and never reaches the public list.
 */
export type ReportKind = "bug" | "feedback" | "tester";

export interface SubmittedReport {
  ref: string;
  id: number;
  delivery: string[];
}

/** VSK-1 reads as a ticket; a bare 1 reads as a bug in the form. */
export const refOf = (id: number): string => `VSK-${id}`;

/**
 * Raise the issue, when there is a token to raise it with.
 *
 * The reporter's address never goes into the issue body — an issue on a public
 * tracker is a public document, and they gave us the address to be answered at,
 * not to be published.
 *
 * A tester signup is skipped outright. Its body is a person's VK profile and
 * their address is the reason they wrote; an issue is the wrong shape of
 * container for it at every level.
 */
const raiseIssue = async (report: Report): Promise<number | null> => {
  if (report.kind === "tester") return null;
  if (!GITHUB_TOKEN) return null;
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: `${report.kind === "bug" ? "[bug]" : "[feedback]"} ${report.title}`,
      body: `${report.body}\n\n---\nReported from the website as ${refOf(report.id)}${
        report.email ? " · the reporter left an address, it is in the database" : ""
      }.`,
      labels: [report.kind === "bug" ? "bug" : "feedback", "from-website"],
    }),
  });
  if (!response.ok) throw new Error(`github answered ${response.status}`);
  return (await response.json()).number ?? null;
};

/** Mail it on, when there is somewhere to mail it to. */
const mail = async (report: Report): Promise<void> => {
  if (!RESEND_KEY || !MAIL_TO) return;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json"},
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [MAIL_TO],
      // so a reply goes to the person rather than into the void
      ...(report.email ? {reply_to: report.email} : {}),
      subject: `${report.kind === "tester" ? "beta tester · " : ""}${refOf(report.id)} · ${report.title}`,
      text: `${report.body}\n\n---\n${report.kind} · ${refOf(report.id)}\nfrom: ${report.email || "no address left"}`,
    }),
  });
  if (!response.ok) throw new Error(`resend answered ${response.status}`);
};

export const isStorageEnabled = (): boolean => db.enabled;

/**
 * Write it down, then try to deliver it.
 *
 * Throws only when the report could not be STORED — that is the one failure
 * the person on the form needs to know about, because it is the one where
 * typing it again is the right move. A failed mail or a failed issue is our
 * problem, recorded on the row, and the report is still safe.
 */
export const submit = async (input: {
  kind: ReportKind;
  title: string;
  body: string;
  email?: string | null;
}): Promise<SubmittedReport> => {
  const ds = await initDataSource();
  if (!ds) throw new Error("reports are not configured on this server");

  const repository = ds.getRepository(Report);
  const saved = await repository.save(
    repository.create({
      kind: input.kind,
      title: input.title,
      body: input.body,
      email: input.email || null,
      status: "open",
    }),
  );

  const delivery: string[] = [];
  try {
    const issue = await raiseIssue(saved);
    if (issue) {
      saved.githubIssue = issue;
      delivery.push(`github#${issue}`);
    } else {
      delivery.push(input.kind === "tester" ? "github:skipped (tester)" : "github:not configured");
    }
  } catch (error) {
    delivery.push(`github:failed (${(error as Error).message})`);
  }

  try {
    await mail(saved);
    delivery.push(RESEND_KEY && MAIL_TO ? "mail:sent" : "mail:not configured");
  } catch (error) {
    delivery.push(`mail:failed (${(error as Error).message})`);
  }

  saved.delivery = delivery.join("; ");
  // never let a bookkeeping write turn a stored report into a failed one
  await repository.save(saved).catch(() => undefined);

  return {ref: refOf(saved.id), id: saved.id, delivery};
};

/**
 * The public dashboard: what came in, never who sent it.
 *
 * Tester signups are left out. The list exists so somebody holding a ticket
 * number can see their report move, and a signup is not a report — publishing
 * a running count of who asked to join a closed test serves nobody.
 */
export const recent = async (limit = 50): Promise<Array<{
  ref: string;
  kind: string;
  title: string;
  status: string;
  createdAt: Date;
}>> => {
  const ds = await initDataSource();
  if (!ds) return [];
  const rows = await ds.getRepository(Report).find({
    where: [{kind: "bug"}, {kind: "feedback"}],
    order: {id: "DESC"},
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.map((row) => ({
    ref: refOf(row.id),
    kind: row.kind,
    title: row.title,
    status: row.status,
    createdAt: row.createdAt,
  }));
};
