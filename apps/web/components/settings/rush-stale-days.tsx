"use client";

import { useId, useState } from "react";
import { useSaveRushSettings } from "@repo/hooks";
import {
  RUSH_SETTINGS_COPY as COPY,
  RUSH_STALE_DAYS_MAX,
  RUSH_STALE_DAYS_MIN,
} from "@repo/validation";
import { SettingsRow } from "@/components/shared/settings-row";
import { Input } from "@/components/ui/input";
import { toastFailure } from "@/lib/failure-toast";

/**
 * Recruitment → Rules' follow-up row (#5934): how many days without a logged
 * contact before a prospect needs a follow-up, typed in place and saved on
 * Enter or leaving the field. `rush:manage` changes it; everyone else reads
 * it.
 */
export function RushStaleDaysRow({
  staleDays,
  canEdit,
}: {
  staleDays: number;
  canEdit: boolean;
}) {
  if (canEdit) return <StaleDaysRow staleDays={staleDays} />;
  return (
    <SettingsRow
      label={COPY.staleDays.readOnly(staleDays)}
      description={COPY.roleCantChange}
      control={null}
    />
  );
}

function StaleDaysRow({ staleDays }: { staleDays: number }) {
  const save = useSaveRushSettings();
  return (
    <RushDaysRow
      days={staleDays}
      min={RUSH_STALE_DAYS_MIN}
      max={RUSH_STALE_DAYS_MAX}
      label={COPY.staleDays.label}
      description={COPY.staleDays.hint}
      ariaLabel="Days without a logged contact before a prospect needs follow-up"
      failTitle={COPY.staleDays.failed}
      onSave={(days, done) => save.mutate({ stale_days: days }, done)}
    />
  );
}

/**
 * A recruitment setting that is a number of days (#5934's stale days, #5973's
 * bid days): typed, saved on Enter or leaving the field with a quiet "Saved",
 * Escape putting the old one back (rulebook § 9, settings save on their own),
 * and a number outside the range said under the label.
 */
export function RushDaysRow({
  days,
  min,
  max,
  label,
  description,
  ariaLabel,
  failTitle,
  onSave,
}: {
  days: number;
  min: number;
  max: number;
  label: string;
  description: string;
  ariaLabel: string;
  failTitle: string;
  onSave: (
    days: number,
    done: { onSuccess: () => void; onError: (error: unknown) => void },
  ) => void;
}) {
  const inputId = useId();
  const errorId = useId();
  const [text, setText] = useState(String(days));
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // A value saved from elsewhere (another officer, the phone) replaces what
  // the field shows; set during render, React's pattern for state that
  // follows a prop.
  const [shownFor, setShownFor] = useState(days);
  if (shownFor !== days) {
    setShownFor(days);
    setText(String(days));
  }

  function commit() {
    const trimmed = text.trim();
    const next = Number(trimmed);
    if (!/^\d+$/.test(trimmed) || next < min || next > max) {
      setProblem(COPY.daysRange(min, max));
      return;
    }
    setProblem(null);
    if (next === days) return;
    onSave(next, {
      onSuccess: () => setSaved(true),
      onError: (error) => {
        setText(String(days));
        toastFailure({
          title: failTitle,
          error,
          fallback: "Retry in a moment.",
        });
      },
    });
  }

  return (
    <SettingsRow
      label={label}
      description={
        problem ? (
          <span id={errorId} role="alert" className="text-destructive-text">
            {problem}
          </span>
        ) : saved ? (
          "Saved"
        ) : (
          description
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
            aria-label={ariaLabel}
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
                setText(String(days));
                setProblem(null);
              }
            }}
            className="h-9 w-16 text-center tabular-nums"
          />
          <span className="text-sm text-muted-foreground">
            {COPY.daysSuffix}
          </span>
        </span>
      }
    />
  );
}
