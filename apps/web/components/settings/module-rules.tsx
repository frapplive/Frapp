"use client";

import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ADJUSTMENT_RATE_LIMIT_MAX,
  CHAPTER_POINTS_CONFIG_DEFAULTS,
  POINTS_ADJUSTMENT_MAX,
  SERVICE_MINUTES_PER_POINT_DEFAULT,
  servicePointsForDuration,
  type PatchChapterConfig,
} from "@repo/validation";
import type { OrgPoints, OrgWorkflow } from "@repo/hooks";
import { SettingsGroup } from "@/components/shared/settings-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn, guardIntDraft, parseGuardedInt } from "@/lib/utils";

/**
 * The Rules block of a module page (#4073): only settings that are stored and
 * read. Service hours has its point rate (`chapter_service_config`) and the
 * proof switch (`wf_hours_receipt`); Points has its two anti-fraud limits
 * (`chapter_points_config`). Neither had a web control before: the rate and
 * limits were API-only, and the proof switch sat in a Workflows list beside
 * seven switches nothing read (#3439).
 *
 * Numbers validate when the officer saves or leaves the field, not on every
 * keystroke (Paul, 2026-11-06), and say what is wrong under the field.
 * A switch saves the moment it flips, like Privacy's.
 */

type Patch = (diff: PatchChapterConfig, successTitle: string) => Promise<void>;

/** A bounded whole number as typed, or the sentence saying why it isn't one. */
export function readBounded(
  draft: string,
  min: number,
  max: number,
): { value: number } | { error: string } {
  const value = parseGuardedInt(draft, min);
  if (draft.trim() === "") return { error: "Enter a number." };
  if (value === undefined) return { error: `Use a whole number from ${min}.` };
  if (value > max) {
    return { error: `Use ${max.toLocaleString("en-US")} or less.` };
  }
  return { value };
}

export function NumberRule({
  label,
  hint,
  suffix,
  draft,
  onDraft,
  error,
  onBlur,
  disabled,
  example,
  asItem = false,
}: {
  label: string;
  hint: ReactNode;
  suffix: string;
  draft: string;
  onDraft: (next: string) => void;
  error?: string;
  onBlur?: () => void;
  disabled: boolean;
  /** One line saying what the number means for a real member. */
  example?: ReactNode;
  /**
   * A row of a `RuleGroup` (`SettingsGroup`): an `<li>` at the settings row's
   * height, rather than a block of an older `RulesList`.
   */
  asItem?: boolean;
}) {
  const id = useId();
  const Row = asItem ? "li" : "div";
  return (
    <Row
      className={cn(
        "flex flex-col gap-3 px-4 sm:flex-row sm:justify-between sm:gap-8",
        asItem ? "min-h-11 py-2.5 sm:items-center" : "py-4 sm:items-start",
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <p className="text-caption text-muted-foreground">{hint}</p>
        {example ? (
          <p className="text-caption text-muted-foreground">{example}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        <div className="flex items-center gap-2">
          <Input
            id={id}
            inputMode="numeric"
            value={draft}
            onChange={(event) => {
              const next = guardIntDraft(event.target.value);
              if (next !== undefined) onDraft(next);
            }}
            onBlur={onBlur}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="w-24 text-right tabular-nums"
          />
          <span className="w-16 text-sm text-muted-foreground">{suffix}</span>
        </div>
        {error ? (
          <p id={`${id}-error`} className="text-caption text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Row>
  );
}

export function SwitchRule({
  label,
  hint,
  checked,
  onChange,
  disabled,
  nested = false,
  muted = false,
  asItem = false,
}: {
  label: string;
  hint: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
  /** A switch that only matters under the row above it: drawn indented. */
  nested?: boolean;
  /** Its label greys while the switch it waits on is off. */
  muted?: boolean;
  /** A row of a `RuleGroup`: an `<li>` at the settings row's height. */
  asItem?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const Row = asItem ? "li" : "div";
  return (
    <Row
      className={cn(
        "flex justify-between gap-8 px-4",
        asItem ? "min-h-11 items-center py-2.5" : "items-start py-4",
        nested && "pl-10",
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <label
          htmlFor={id}
          className={cn(
            "text-sm font-medium",
            muted ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {label}
        </label>
        <div id={hintId} className="text-caption text-muted-foreground">
          {hint}
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-describedby={hintId}
      />
    </Row>
  );
}

/**
 * A module page's group of rules (#6030): the settings group, its heading and
 * at most one footnote, holding `NumberRule`s and `SwitchRule`s drawn
 * `asItem`, and any `SettingsRow` that opens a rule's own page.
 */
export function RuleGroup({
  heading = "Rules",
  footnote,
  children,
}: {
  heading?: string;
  footnote?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SettingsGroup heading={heading} footnote={footnote}>
      {children}
    </SettingsGroup>
  );
}

export function RulesList({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border rounded-[14px] border border-border">
      {children}
    </div>
  );
}

export function SaveRow({
  dirty,
  saving,
  disabled,
  label,
}: {
  dirty: boolean;
  saving: boolean;
  disabled: boolean;
  label: string;
}) {
  if (disabled) return null;
  return (
    <div className="flex justify-end">
      <Button type="submit" disabled={!dirty || saving}>
        {saving ? "Saving" : label}
      </Button>
    </div>
  );
}

function workflowEnabled(
  workflows: readonly OrgWorkflow[],
  key: string,
): boolean {
  return workflows.find((wf) => wf.key === key)?.enabled === true;
}

function hoursForPoints(points: number, minutesPerPoint: number): string {
  const hours = (points * minutesPerPoint) / 60;
  const shown = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${shown} ${hours === 1 ? "hour" : "hours"}`;
}

/** Service hours → Rules: the point rate and the proof switch. */
export function ServiceHoursRules({
  minutesPerPoint,
  workflows,
  canManage,
  savingRate,
  savingWorkflows,
  onPatch,
}: {
  minutesPerPoint: number | undefined;
  workflows: readonly OrgWorkflow[];
  canManage: boolean;
  savingRate: boolean;
  savingWorkflows: boolean;
  onPatch: Patch;
}) {
  const saved = minutesPerPoint ?? SERVICE_MINUTES_PER_POINT_DEFAULT;
  const [draft, setDraft] = useState(String(saved));
  const [error, setError] = useState<string>();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-seed the rate draft when the saved rate changes
    setDraft(String(saved));
    setError(undefined);
  }, [saved]);

  const read = readBounded(draft, 1, POINTS_ADJUSTMENT_MAX);
  const rate = "value" in read ? read.value : saved;
  const shiftPoints = servicePointsForDuration(180, rate);

  function check(): number | undefined {
    const next = readBounded(draft, 1, POINTS_ADJUSTMENT_MAX);
    if ("error" in next) {
      setError(next.error);
      return undefined;
    }
    setError(undefined);
    return next.value;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = check();
    if (value === undefined || value === saved) return;
    void onPatch({ service: { minutes_per_point: value } }, "Point rate saved");
  }

  const proof = workflowEnabled(workflows, "wf_hours_receipt");
  const hasProofWorkflow = workflows.some(
    (wf) => wf.key === "wf_hours_receipt",
  );

  return (
    <form
      id="settings-module-hours-rules"
      aria-label="Rules"
      onSubmit={submit}
      className="scroll-mt-16 space-y-3"
      noValidate
    >
      <RuleGroup footnote={rulesFootnote(canManage)}>
        <NumberRule
          asItem
          label="Minutes of service per point"
          hint={
            <>
              A 3-hour shift earns {shiftPoints.toLocaleString("en-US")}{" "}
              {shiftPoints === 1 ? "point" : "points"}, and 10 points take{" "}
              {hoursForPoints(10, rate)}. Entries already approved keep theirs.
            </>
          }
          suffix="minutes"
          draft={draft}
          onDraft={setDraft}
          onBlur={() => void check()}
          error={error}
          disabled={!canManage || savingRate}
        />
        {hasProofWorkflow ? (
          <SwitchRule
            asItem
            label="Ask for proof"
            hint="A photo or a signed slip, which the approving officer sees."
            checked={proof}
            disabled={!canManage || savingWorkflows}
            onChange={(enabled) =>
              void onPatch(
                { workflows: [{ key: "wf_hours_receipt", enabled }] },
                enabled ? "Proof is now required" : "Proof is now optional",
              )
            }
          />
        ) : null}
      </RuleGroup>
      <SaveRow
        dirty={draft !== String(saved)}
        saving={savingRate}
        disabled={!canManage}
        label="Save rate"
      />
    </form>
  );
}

/** A module's Rules footnote: they're logged, and whether you can change them. */
function rulesFootnote(canManage: boolean, lead?: string): string {
  const logged = "Changes are recorded in Logs.";
  const said = lead ? `${lead} ${logged}` : logged;
  return canManage ? said : `${said} Your role can't change these.`;
}

/** Points → Rules: the two anti-fraud limits on manual adjustments. */
export function PointsRules({
  points,
  canManage,
  saving,
  onPatch,
}: {
  points: OrgPoints | undefined;
  canManage: boolean;
  saving: boolean;
  onPatch: Patch;
}) {
  const saved = points ?? CHAPTER_POINTS_CONFIG_DEFAULTS;
  const [rateDraft, setRateDraft] = useState(
    String(saved.adjustment_rate_limit_per_hour),
  );
  const [flagDraft, setFlagDraft] = useState(String(saved.anomaly_threshold));
  const [rateError, setRateError] = useState<string>();
  const [flagError, setFlagError] = useState<string>();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-seed the drafts when the saved limits change
    setRateDraft(String(saved.adjustment_rate_limit_per_hour));
    setFlagDraft(String(saved.anomaly_threshold));
    setRateError(undefined);
    setFlagError(undefined);
  }, [saved.adjustment_rate_limit_per_hour, saved.anomaly_threshold]);

  function checkRate(): number | undefined {
    const next = readBounded(rateDraft, 1, ADJUSTMENT_RATE_LIMIT_MAX);
    setRateError("error" in next ? next.error : undefined);
    return "value" in next ? next.value : undefined;
  }
  function checkFlag(): number | undefined {
    const next = readBounded(flagDraft, 1, POINTS_ADJUSTMENT_MAX);
    setFlagError("error" in next ? next.error : undefined);
    return "value" in next ? next.value : undefined;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rate = checkRate();
    const flag = checkFlag();
    if (rate === undefined || flag === undefined) return;
    void onPatch(
      {
        points: {
          adjustment_rate_limit_per_hour: rate,
          anomaly_threshold: flag,
        },
      },
      "Points limits saved",
    );
  }

  const dirty =
    rateDraft !== String(saved.adjustment_rate_limit_per_hour) ||
    flagDraft !== String(saved.anomaly_threshold);
  const disabled = !canManage || saving;

  return (
    <form
      id="settings-module-points-rules"
      aria-label="Rules"
      onSubmit={submit}
      className="scroll-mt-16 space-y-3"
      noValidate
    >
      <RuleGroup
        footnote={rulesFootnote(
          canManage,
          "Limits on points added or taken by hand; points from events, tasks and service aren't limited.",
        )}
      >
        <NumberRule
          asItem
          label="Adjustments per officer each hour"
          hint="Past this, an officer's next one waits for the hour."
          suffix="an hour"
          draft={rateDraft}
          onDraft={setRateDraft}
          onBlur={() => void checkRate()}
          error={rateError}
          disabled={disabled}
        />
        <NumberRule
          asItem
          label="Flag adjustments of"
          hint="Up or down, flagged in the ledger for another officer to check."
          suffix="points"
          draft={flagDraft}
          onDraft={setFlagDraft}
          onBlur={() => void checkFlag()}
          error={flagError}
          disabled={disabled}
        />
      </RuleGroup>
      <SaveRow
        dirty={dirty}
        saving={saving}
        disabled={!canManage}
        label="Save limits"
      />
    </form>
  );
}

/**
 * Dues → the grace period (`wf_dues_grace`): whether an unpaid invoice gets
 * one, and how many days. This workflow's threshold is the grace period
 * `GET /invoices/overdue` applies; the Dues form's own `grace_days` is not
 * read (`customization.md` § Workflows, the duplicate is in the backlog).
 */
export function DuesGraceRule({
  workflows,
  canManage,
  saving,
  onPatch,
}: {
  workflows: readonly OrgWorkflow[];
  canManage: boolean;
  saving: boolean;
  onPatch: Patch;
}) {
  const workflow = workflows.find((wf) => wf.key === "wf_dues_grace");
  const savedDays = workflow?.threshold ?? 7;
  const [draft, setDraft] = useState(String(savedDays));
  const [error, setError] = useState<string>();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-seed the days draft when the saved grace period changes
    setDraft(String(savedDays));
    setError(undefined);
  }, [savedDays]);
  if (!workflow) return null;
  const enabled = workflow.enabled;
  const disabled = !canManage || saving;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = readBounded(draft, 0, 365);
    if ("error" in next) {
      setError(next.error);
      return;
    }
    setError(undefined);
    void onPatch(
      { workflows: [{ key: "wf_dues_grace", enabled, threshold: next.value }] },
      "Grace period saved",
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <RulesList>
        <SwitchRule
          label="Grace period before late"
          hint="Off, an unpaid invoice is late the day after it's due."
          checked={enabled}
          disabled={disabled}
          onChange={(next) =>
            void onPatch(
              { workflows: [{ key: "wf_dues_grace", enabled: next }] },
              next ? "Grace period on" : "Grace period off",
            )
          }
        />
        {enabled ? (
          <NumberRule
            label="Grace period"
            hint="Days after the due date before an unpaid invoice is late."
            suffix="days"
            draft={draft}
            onDraft={setDraft}
            error={error}
            disabled={disabled}
          />
        ) : null}
      </RulesList>
      {enabled ? (
        <SaveRow
          dirty={draft !== String(savedDays)}
          saving={saving}
          disabled={!canManage}
          label="Save grace period"
        />
      ) : null}
    </form>
  );
}
