"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  useInterestFormWithdrawalPreview,
  useWithdrawInterestForm,
  type InterestFormWithdrawalScope,
} from "@repo/hooks";
import { INTEREST_FORM_WITHDRAW_COPY as COPY } from "@repo/validation";
import { Skeleton } from "@/components/shared/async-states";
import { FieldError } from "@/components/shared/short-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The token from `#<token>`; null when there is none. */
function readToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = window.location.hash.replace(/^#/, "").trim();
  return token || null;
}

/**
 * The withdraw link's page (#5977), as small as the job: pick one of two,
 * confirm, done. The fuller PNM view (details, events, bids) is a later
 * slice. Unsubscribe pages from Mailchimp and Google set the pattern: one
 * screen, one choice, no account.
 */
export function WithdrawPage() {
  // The page renders only in the browser (`app/(public)/withdraw/page.tsx`
  // loads it with `ssr: false`), where the fragment exists.
  const [token] = useState(readToken);
  useEffect(() => {
    // Drop the token from the address bar, so a shared screenshot or a
    // copied link doesn't carry it.
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const preview = useInterestFormWithdrawalPreview(token);
  const withdraw = useWithdrawInterestForm();
  const [scope, setScope] = useState<InterestFormWithdrawalScope | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (token && preview.isPending) {
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <h1 className="sr-only">Opening…</h1>
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!token || preview.isError || !preview.data) {
    return (
      <section className="my-auto space-y-2">
        <h1 className="text-headline font-bold tracking-tight text-foreground">
          {COPY.invalidTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{COPY.invalidBody}</p>
      </section>
    );
  }

  const chapter = preview.data.chapter_name;
  if (done) {
    return (
      <section className="space-y-2" aria-live="polite">
        <h1 className="text-headline font-bold tracking-tight text-foreground">
          {COPY.title}
        </h1>
        <p className="text-sm text-foreground">{done}</p>
      </section>
    );
  }

  const options: {
    scope: InterestFormWithdrawalScope;
    label: string;
    line: string;
  }[] = [
    {
      scope: "chapter",
      label: COPY.chapter(chapter),
      line: COPY.chapterLine(chapter),
    },
    {
      scope: "everywhere",
      label: COPY.everywhere,
      line: preview.data.at_school
        ? COPY.everywhereLine
        : COPY.everywhereLineNoSchool(chapter),
    },
  ];

  function run() {
    if (!token || !scope) return;
    setError(null);
    withdraw.mutate(
      { token, scope },
      {
        onSuccess: () =>
          setDone(
            scope === "chapter"
              ? COPY.doneChapter(chapter)
              : COPY.doneEverywhere,
          ),
        onError: () => setError(COPY.failed),
      },
    );
  }

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-headline font-bold tracking-tight text-foreground">
          {COPY.title}
        </h1>
        <p className="text-sm text-muted-foreground">{COPY.intro(chapter)}</p>
      </div>

      {confirming && scope ? (
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            {scope === "chapter"
              ? COPY.confirmChapter(chapter)
              : COPY.confirmEverywhere}
          </p>
          {error ? <FieldError>{error}</FieldError> : null}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={scope === "everywhere" ? "destructive" : "default"}
              disabled={withdraw.isPending}
              onClick={run}
            >
              {withdraw.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {withdraw.isPending ? COPY.working : COPY.confirm}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={withdraw.isPending}
              onClick={() => setConfirming(false)}
            >
              {COPY.back}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div
            role="radiogroup"
            aria-label={COPY.title}
            className="divide-y divide-border rounded-[14px] border border-border bg-card"
          >
            {options.map((option) => (
              <label
                key={option.scope}
                className={cn(
                  "flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-card-hover",
                  scope === option.scope && "bg-card-hover",
                )}
              >
                <input
                  type="radio"
                  name="withdraw-scope"
                  value={option.scope}
                  checked={scope === option.scope}
                  onChange={() => setScope(option.scope)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {option.line}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <Button
            type="button"
            disabled={!scope}
            onClick={() => setConfirming(true)}
          >
            {COPY.continue}
          </Button>
        </div>
      )}
    </section>
  );
}
