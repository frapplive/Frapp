"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  FileText,
  Link2,
  MessageSquare,
  NotebookPen,
  X,
} from "lucide-react";
import { randomClientId } from "@repo/api-sdk";
import { useFrappLinkCandidates, useFrappLinks } from "@repo/hooks";
import {
  FRAPP_LINK_COPY,
  FRAPP_LINK_TITLE_MAX,
  FRAPP_LINKS_MAX,
  frappLinkKey,
  frappLinkRow,
  frappLinksHold,
  frappLinkCandidateDetail,
  frappLinkUrlProblem,
  frappLinkWebHref,
  frappWebLinkTitle,
  normalizeFrappLinkUrl,
  parseFrappAppLink,
  withFrappLink,
  type FrappLink,
  type FrappLinkKind,
  type FrappLinkTarget,
  type FrappRecordLinkKind,
} from "@repo/validation";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { QUIET_LINK } from "@/components/ui/quiet-link";
import { FOCUS_RING_OFFSET } from "@/components/ui/focus";
import { cn } from "@/lib/utils";

/**
 * A list of Frapp links (`spec/behavior/frapp-links.md`): an event's
 * attachments and a task's Attached row draw the same rows and the same
 * attach picker, as the phone's `components/frapp-links.tsx` does.
 *
 * Each record row reads its name live for the member looking (a document,
 * minutes, an event or a chat message), or says "You don't have access" or
 * "Removed" without opening. A web link shows its title and domain.
 */

const ICONS: Record<FrappLinkKind, typeof Link2> = {
  link: Link2,
  document: FileText,
  minutes: NotebookPen,
  event: CalendarDays,
  message: MessageSquare,
};

const ROW =
  "flex min-h-control-list-row items-center gap-2 pointer-coarse:min-h-11";
const ROW_LINK = cn(
  "flex min-w-0 flex-1 items-center gap-2 rounded-sm text-sm hover:underline",
  FOCUS_RING_OFFSET,
);

export type FrappLinksChange = (
  update: (current: FrappLink[]) => FrappLink[],
) => void;

export function FrappLinkRows({
  links,
  canEdit,
  onChange,
}: {
  links: readonly FrappLink[];
  canEdit: boolean;
  onChange: FrappLinksChange;
}) {
  const { resolved } = useFrappLinks(links);
  if (links.length === 0) return null;
  return (
    <ul className="grid gap-1">
      {links.map((link, index) => {
        const row = frappLinkRow(
          link,
          link.kind === "link" ? undefined : resolved.get(frappLinkKey(link)),
        );
        const Icon = ICONS[link.kind];
        const body: ReactNode = (
          <>
            <Icon
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span
              className={cn(
                "truncate",
                !row.opens && "text-muted-foreground",
                row.pending && "text-muted-foreground",
              )}
            >
              {row.name}
            </span>
            {row.detail ? (
              <span className="shrink-0 text-caption text-muted-foreground">
                {row.detail}
              </span>
            ) : null}
          </>
        );
        return (
          <li key={link.id} className={ROW}>
            {!row.opens ? (
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                {body}
              </span>
            ) : link.kind === "link" ? (
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={ROW_LINK}
              >
                {body}
              </a>
            ) : (
              <Link href={frappLinkWebHref(link)} className={ROW_LINK}>
                {body}
              </Link>
            )}
            {canEdit ? (
              <IconButton
                label={
                  // A web link keeps its title even when it doesn't open
                  // (#5883); only a record's name can be unreadable.
                  row.opens || link.kind === "link"
                    ? FRAPP_LINK_COPY.remove(row.name)
                    : FRAPP_LINK_COPY.removeUnnamed(
                        FRAPP_LINK_COPY.kindNames[
                          link.kind as FrappRecordLinkKind
                        ],
                        index + 1,
                      )
                }
                onClick={() =>
                  onChange((current) =>
                    current.filter((entry) => entry.id !== link.id),
                  )
                }
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The attach picker: one field that searches Chapter Files, minutes and the
 * calendar as you type, and takes a pasted address. A pasted Frapp address
 * attaches the record it names; any other http(s) address attaches as a web
 * link, with an optional title.
 */
export function FrappLinkPicker({
  links,
  documentsOn = null,
  onChange,
  onDone,
}: {
  links: readonly FrappLink[];
  /** Whether Chapter Files is on: `false` offers no files; `null` can't say yet. */
  documentsOn?: boolean | null;
  onChange: FrappLinksChange;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const fieldId = useId();
  const titleId = useId();
  const problemId = useId();
  const typed = text.trim();
  const looksLikeAddress = /^(https?:\/\/|www\.)/i.test(typed);
  const appTarget = useMemo(
    () =>
      looksLikeAddress
        ? parseFrappAppLink(
            typed,
            typeof window === "undefined" ? [] : [window.location.origin],
          )
        : null,
    [looksLikeAddress, typed],
  );
  const { candidates, isLoading, isError } = useFrappLinkCandidates(
    looksLikeAddress ? "" : typed,
    { enabled: !looksLikeAddress, documents: documentsOn !== false },
  );
  const offered = candidates.filter(
    (candidate) => !frappLinksHold(links, candidate.target),
  );

  function attach(target: FrappLinkTarget) {
    onChange((current) => withFrappLink(current, target, randomClientId));
    onDone();
  }

  function attachAddress() {
    if (appTarget) {
      if (frappLinksHold(links, appTarget)) {
        setProblem("That is attached already.");
        return;
      }
      attach(appTarget);
      return;
    }
    const refused = frappLinkUrlProblem(typed);
    const url = normalizeFrappLinkUrl(typed);
    if (refused || !url) {
      setProblem(refused ?? "Paste a web address.");
      return;
    }
    if (frappLinksHold(links, { kind: "link", url })) {
      setProblem("That is attached already.");
      return;
    }
    onChange((current) =>
      withFrappLink(
        current,
        { kind: "link", url, title: frappWebLinkTitle(title, url) },
        randomClientId,
      ),
    );
    onDone();
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (looksLikeAddress) attachAddress();
        else if (offered[0]) attach(offered[0].target);
      }}
    >
      <label htmlFor={fieldId} className="sr-only">
        {FRAPP_LINK_COPY.attach}
      </label>
      <Input
        id={fieldId}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setProblem(null);
        }}
        placeholder={FRAPP_LINK_COPY.pickerPlaceholder}
        autoFocus
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? problemId : undefined}
      />
      {looksLikeAddress && !appTarget ? (
        <>
          <label htmlFor={titleId} className="sr-only">
            Title
          </label>
          <Input
            id={titleId}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title (optional)"
            maxLength={FRAPP_LINK_TITLE_MAX}
          />
        </>
      ) : null}
      {problem ? (
        <p id={problemId} className="text-sm text-destructive-text">
          {problem}
        </p>
      ) : null}
      {looksLikeAddress ? null : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError && offered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {FRAPP_LINK_COPY.loadFailed}
        </p>
      ) : offered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {FRAPP_LINK_COPY.noMatches}
        </p>
      ) : (
        <ul className="grid max-h-64 gap-1 overflow-y-auto">
          {offered.map((candidate) => {
            const Icon = ICONS[candidate.kind];
            const detail = frappLinkCandidateDetail(
              candidate.kind,
              candidate.date,
            );
            return (
              <li key={frappLinkKey(candidate.target)}>
                <button
                  type="button"
                  onClick={() => attach(candidate.target)}
                  className={cn(
                    "flex min-h-control-list-row w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-card-hover pointer-coarse:min-h-11",
                    FOCUS_RING_OFFSET,
                  )}
                >
                  <Icon
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="truncate">{candidate.name}</span>
                  <span className="ml-auto shrink-0 text-caption text-muted-foreground">
                    {detail}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex gap-2">
        {looksLikeAddress ? (
          <Button type="submit" size="sm">
            {appTarget ? FRAPP_LINK_COPY.attach : "Add link"}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Rows plus the quiet Attach action and its picker, for a list edited in
 * place. Full, the action gives way to a line saying so.
 */
export function FrappLinksEditor({
  links,
  canEdit,
  documentsOn = null,
  onChange,
}: {
  links: readonly FrappLink[];
  canEdit: boolean;
  documentsOn?: boolean | null;
  onChange: FrappLinksChange;
}) {
  const [picking, setPicking] = useState(false);
  const full = links.length >= FRAPP_LINKS_MAX;
  return (
    <div className="grid gap-2">
      <FrappLinkRows links={links} canEdit={canEdit} onChange={onChange} />
      {canEdit && full ? (
        <p className="text-caption text-muted-foreground">
          {FRAPP_LINK_COPY.full}
        </p>
      ) : null}
      {canEdit && !full && picking ? (
        <FrappLinkPicker
          links={links}
          documentsOn={documentsOn}
          onChange={onChange}
          onDone={() => setPicking(false)}
        />
      ) : null}
      {canEdit && !full && !picking ? (
        <div>
          <button
            type="button"
            className={QUIET_LINK}
            onClick={() => setPicking(true)}
          >
            {FRAPP_LINK_COPY.attach}
          </button>
        </div>
      ) : null}
    </div>
  );
}
