/**
 * What a task asks for when it is marked done (#4635), set per task by an
 * officer: nothing, one or more photos, or a link. It replaced #4565's
 * `photo_required` switch. `spec/behavior/tasks.md` § Photos.
 */
export const TASK_PROOF_KINDS = ["none", "photo", "link"] as const;
export type TaskProofKind = (typeof TASK_PROOF_KINDS)[number];

/** The control's words, in the order it shows them. */
export const TASK_PROOF_KIND_LABELS: Record<TaskProofKind, string> = {
  none: "None",
  photo: "Photo",
  link: "Link",
};

/**
 * Photos per task and kind: up to 6 reference photos on a task, and up to 6
 * proof photos on a completion. Six keeps a proof grid readable at a glance
 * on a phone. The API refuses a 7th.
 */
/** What the officer's proof control says under it, on both apps. */
export const TASK_PROOF_KIND_HINTS: Record<TaskProofKind, string> = {
  none: "Marking it done needs nothing more.",
  photo: "Marking it done needs a photo of the finished job.",
  link: "Marking it done needs a link, such as a doc or a post.",
};

export const TASK_PHOTOS_MAX = 6;

/** An officer's reason for sending a completion back: one line. */
export const TASK_SEND_BACK_REASON_MAX = 200;
/** The assignee's reply when they mark a sent-back task done again. */
export const TASK_COMPLETION_NOTE_MAX = 500;
/** A proof link, stored as typed. */
export const TASK_PROOF_LINK_MAX = 2048;

/**
 * The 400 `PATCH /v1/tasks/:id/status` answers when a task is marked done
 * without the proof its kind asks for: no photo on a Photo task (#4565), or
 * no link on a Link task (#4635). The code is the contract, as
 * `SERVICE_RECEIPT_REQUIRED_CODE`'s is: an installed phone build matches it
 * for as long as it lives, so it never changes.
 */
export const TASK_PROOF_REQUIRED_CODE = "task.proof_required";
export const TASK_PROOF_REQUIRED_MESSAGE =
  "This task needs a photo to show it's done. Add one, then mark it done.";
export const TASK_PROOF_LINK_REQUIRED_MESSAGE =
  "This task needs a link to show it's done. Add one, then mark it done.";

/**
 * The 400 when a task an officer sent back is marked done again with nothing
 * new (#4635): no fresh proof and no reply to the reason. Stable, like
 * `TASK_PROOF_REQUIRED_CODE`.
 */
export const TASK_RESUBMIT_NEEDS_CHANGE_CODE = "task.resubmit_needs_change";
export const TASK_RESUBMIT_NEEDS_CHANGE_MESSAGE =
  "This task was sent back. Add proof or reply to the officer, then mark it done.";

/**
 * Whether a completed task waits on an officer's sign-off (#4635, decision
 * C): only one with points or required proof does. Any other is Done when
 * the assignee marks it done; an officer can still send it back.
 */
export function taskNeedsSignOff(task: {
  point_reward?: number | null;
  proof_kind?: TaskProofKind | string | null;
}): boolean {
  return (
    (task.point_reward ?? 0) > 0 ||
    (task.proof_kind != null && task.proof_kind !== "none")
  );
}

/**
 * Whether a completion was signed off as it was marked done because it needed
 * no sign-off (#4635), rather than confirmed by an officer: the automatic
 * sign-off stamps `confirmed_at` with the completion's own `completed_at`.
 * Nothing was paid on it, so it can still be taken back or sent back; an
 * officer's confirmation (which always comes later) can't.
 */
export function taskSignedOffAutomatically(task: {
  points_awarded?: boolean | null;
  completed_at?: string | null;
  confirmed_at?: string | null;
  point_reward?: number | null;
  proof_kind?: TaskProofKind | string | null;
}): boolean {
  return (
    task.points_awarded === true &&
    !!task.completed_at &&
    !!task.confirmed_at &&
    Date.parse(task.confirmed_at) === Date.parse(task.completed_at) &&
    !taskNeedsSignOff(task)
  );
}

/**
 * A public site's name: dotted, ending in a top-level domain (letters, or an
 * internationalized one's `xn--` form). Not `test`, `localhost`, an IP
 * address or `example.com.`, which no officer's phone can open (#5882).
 */
const PUBLIC_HOSTNAME =
  /^(?:[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * Top-level names reserved for a device or network of its own (RFC 6761,
 * RFC 6762, ICANN's `.internal`), which resolve nowhere on the open web.
 */
const PRIVATE_TLDS = new Set([
  "localhost",
  "local",
  "test",
  "invalid",
  "internal",
]);

/**
 * A proof link as Frapp keeps it: trimmed, http or https only, or `null`
 * when it isn't one. Never fetched; shown as its domain. A new proof link
 * or agenda link attachment must also pass `proofLinkOpens`.
 */
export function normalizeProofLink(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > TASK_PROOF_LINK_MAX) return null;
  // The scheme and its slashes as typed: `new URL` also takes
  // `https:example.com` and `http:/x`, which the database's
  // `^https?://` check refuses.
  if (!/^https?:\/\//i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  return trimmed;
}

/**
 * Whether a proof link names a public site an officer's phone can open:
 * http or https on a dotted name ending in a top-level domain. A link to a
 * name that resolves nowhere (`https://test`, `https://localhost`, an IP
 * address, a `.local` or `.test` name) opened in the officer's browser as "server can't be found"
 * (#5882), so Mark done refuses one, and a stored one shows as text rather
 * than a chip that opens.
 */
export function proofLinkOpens(link: string): boolean {
  if (!normalizeProofLink(link)) return false;
  try {
    const host = new URL(link.trim()).hostname;
    return (
      PUBLIC_HOSTNAME.test(host) &&
      !PRIVATE_TLDS.has(host.slice(host.lastIndexOf(".") + 1))
    );
  } catch {
    return false;
  }
}

/**
 * What a stored link that fails `proofLinkOpens` says beside its address,
 * on a task's proof chip and an event's attachment row (#5882, #5883).
 */
export const LINK_NOT_WORKING_CAPTION = "not a working link";

/** The same, as a screen reader hears it ahead of the address. */
export const LINK_NOT_WORKING_LABEL = "not a working web address";

/** The domain a proof link chip shows ("docs.google.com"). */
export function proofLinkDomain(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

/** Mark done's line for a typed link that isn't a full web address. */
export const TASK_PROOF_LINK_INVALID_MESSAGE =
  "Use a full web link, like https://photos.google.com/…";

/** Send back's line for an empty reason, before it sends (#4635). */
export const TASK_SEND_BACK_REASON_MISSING = "Say what needs to change.";

/** What a Mark done form holds when it is submitted. */
export interface TaskMarkDoneDraft {
  photoCount: number;
  link: string;
  note: string;
}

/**
 * Both apps' check before Mark done sends (#4635), mirroring the server's
 * (`task.proof_required`, `task.resubmit_needs_change`) so neither app sends
 * one it would refuse nor refuses one it would take: a Photo task needs at
 * least one photo, a Link task a valid http(s) link, and a sent-back task
 * something new, proof or a reply. On success, the link and reply to send.
 */
export function taskMarkDoneCheck(
  task: { proofKind: TaskProofKind; sentBack: boolean },
  draft: TaskMarkDoneDraft,
):
  | { ok: true; proof: { proofLink?: string; completionNote?: string } }
  | { ok: false; problem: string } {
  const typed = draft.link.trim();
  // A link typed as a member writes it, `drive.google.com/…` (or with a
  // port, `club.org:8443/x`), takes https:// rather than a refusal (#5882).
  // Only `scheme://` counts as one typed: `javascript:…` gains https:// and
  // is still refused, as no host.
  const withScheme =
    typed && !/^[a-z][a-z0-9+.-]*:\/\//i.test(typed)
      ? `https://${typed}`
      : typed;
  const normalized = withScheme ? normalizeProofLink(withScheme) : null;
  const link = normalized && proofLinkOpens(normalized) ? normalized : null;
  if (typed && !link) {
    return {
      ok: false,
      problem: TASK_PROOF_LINK_INVALID_MESSAGE,
    };
  }
  if (task.proofKind === "photo" && draft.photoCount === 0) {
    return {
      ok: false,
      problem: "Add at least one photo of the finished job.",
    };
  }
  if (task.proofKind === "link" && !link) {
    return { ok: false, problem: "Add a link to show it's done." };
  }
  const note = draft.note.trim();
  if (task.sentBack && draft.photoCount === 0 && !link && !note) {
    return {
      ok: false,
      problem: "Add proof or reply to the officer before marking it done.",
    };
  }
  return {
    ok: true,
    proof: {
      ...(link ? { proofLink: link } : {}),
      ...(note ? { completionNote: note } : {}),
    },
  };
}
