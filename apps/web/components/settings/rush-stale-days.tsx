"use client";

import { useId, useState } from "react";
import { useSaveRushSettings } from "@repo/hooks";
import { RUSH_STALE_DAYS_MAX, RUSH_STALE_DAYS_MIN } from "@repo/validation";
import { ProfileSection } from "@/components/profile/profile-section";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { Input } from "@/components/ui/input";
import { toastFailure } from "@/lib/failure-toast";

function daysWord(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * The chapter's stale days on the Recruitment module page (#5934,
 * `spec/behavior/rush.md` § Contacts, owner and follow-ups): how long an open
 * prospect goes without a logged contact before the board flags them "Needs
 * follow-up" and their owner is told. `rush:manage` types the number, saved on
 * Enter or leaving the field with a quiet "Saved", Escape putting the old one
 * back (rulebook § 9, settings save on their own); everyone else reads it.
 */
export function RushStaleDays({
  staleDays,
  canEdit,
}: {
  staleDays: number;
  canEdit: boolean;
}) {
  return (
    <ProfileSection id="settings-module-rush-follow-up" title="Follow-ups">
      <SettingsGroup>
        {canEdit ? (
          <StaleDaysRow staleDays={staleDays} />
        ) : (
          <SettingsRow
            label={`Needs follow-up after ${daysWord(staleDays)} without a logged contact`}
            description="Your role can't change this."
            control={null}
          />
        )}
      </SettingsGroup>
    </ProfileSection>
  );
}

function StaleDaysRow({ staleDays }: { staleDays: number }) {
  const save = useSaveRushSettings();
  const inputId = useId();
  const errorId = useId();
  const [text, setText] = useState(String(staleDays));
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // A value saved from elsewhere (another officer, the phone) replaces what
  // the field shows; set during render, React's pattern for state that
  // follows a prop.
  const [shownFor, setShownFor] = useState(staleDays);
  if (shownFor !== staleDays) {
    setShownFor(staleDays);
    setText(String(staleDays));
  }

  function commit() {
    const trimmed = text.trim();
    const days = Number(trimmed);
    if (
      !/^\d+$/.test(trimmed) ||
      days < RUSH_STALE_DAYS_MIN ||
      days > RUSH_STALE_DAYS_MAX
    ) {
      setProblem(
        `Pick from ${RUSH_STALE_DAYS_MIN} to ${RUSH_STALE_DAYS_MAX} days.`,
      );
      return;
    }
    setProblem(null);
    if (days === staleDays) return;
    save.mutate(
      { stale_days: days },
      {
        onSuccess: () => setSaved(true),
        onError: (error) => {
          setText(String(staleDays));
          toastFailure({
            title: "Couldn't save the follow-up days",
            error,
            fallback: "Retry in a moment.",
          });
        },
      },
    );
  }

  return (
    <SettingsRow
      label="Needs follow-up after"
      description={
        problem ? (
          <span id={errorId} role="alert" className="text-destructive-text">
            {problem}
          </span>
        ) : saved ? (
          "Saved"
        ) : (
          "Days without a logged contact"
        )
      }
      control={
        <span className="flex items-center gap-2">
          <Input
            id={inputId}
            value={text}
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            aria-label="Days without a logged contact before a prospect needs follow-up"
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? errorId : undefined}
            onChange={(event) => {
              setText(event.target.value);
              setSaved(false);
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setText(String(staleDays));
                setProblem(null);
              }
            }}
            className="h-9 w-16 text-center tabular-nums"
          />
          <span className="text-sm text-muted-foreground">days</span>
        </span>
      }
    />
  );
}
