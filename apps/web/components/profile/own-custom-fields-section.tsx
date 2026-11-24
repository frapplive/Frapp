"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  type OwnCustomField,
  ownCustomFieldFormChanges,
  ownCustomFieldOffersNotSet,
  ownCustomFieldShownValue,
  useOwnCustomFields,
  useUpdateOwnCustomFields,
} from "@repo/hooks";
import { formatPhone } from "@repo/formatting";
import {
  CUSTOM_FIELD_AUDIENCE_LINE,
  customFieldTextMaxLength,
  OWN_CUSTOM_FIELDS_COPY as COPY,
  ownCustomFieldRule,
  PHONE_MAX_LENGTH,
} from "@repo/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ProfileSection } from "@/components/profile/profile-section";
import { Skeleton } from "@/components/shared/async-states";
import {
  SkeletonField,
  SkeletonSectionLabel,
} from "@/components/shared/page-skeletons";
import { NestedError } from "@/components/shared/nested-states";
import { useToast } from "@/lib/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";

/** A Select can't hold an empty value, so "Not set" is this one. */
const NOT_SET = "__not_set__";

/**
 * Your own "More details" on `/profile` (#581): the fields your chapter keeps
 * on a member (T-shirt size, allergies, an emergency contact), every one of
 * them, even those only officers or the president read, since they are yours.
 * Under each, who else sees it, so nobody types an allergy without knowing.
 *
 * One control per type, as Slack's custom profile fields and Discord's
 * server profile draw theirs: a menu for a pick, a switch for yes or no, a
 * phone field that formats the number, and a text box for the rest. It saves
 * with its own button, like the Directory profile form above it, and sends
 * only what changed (`ownCustomFieldFormChanges`), checked on Save, not per key.
 *
 * Nothing draws for a chapter with no fields, or before the member can read
 * the directory (`members:view`, the route's gate).
 */
export function OwnCustomFieldsSection({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const query = useOwnCustomFields({ enabled });
  const update = useUpdateOwnCustomFields();
  const fields = query.data;

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<Record<string, string>>({});
  // The values the draft was last seeded from, so a refetch keeps what the
  // member typed and hasn't saved (the Directory profile form does the same).
  const seededFrom = useRef<Record<string, string> | null>(null);
  useEffect(() => {
    if (!fields) return;
    const next = Object.fromEntries(
      fields.map((field) => [field.field_id, ownCustomFieldShownValue(field)]),
    );
    const previous = seededFrom.current;
    seededFrom.current = next;
    setDraft((current) => {
      if (!previous) return next;
      const merged = { ...next };
      for (const [id, typed] of Object.entries(current)) {
        if (typed !== previous[id]) merged[id] = typed;
      }
      return merged;
    });
  }, [fields]);

  if (!enabled) return null;
  if (query.isLoading) return <OwnCustomFieldsSkeleton />;
  if (query.isError && !fields) {
    return (
      <ProfileSection id="more-details" title={COPY.title}>
        <NestedError
          title="Couldn't load your details"
          description="Try again in a moment."
          onRetry={() => void query.refetch()}
        />
      </ProfileSection>
    );
  }
  if (!fields || fields.length === 0) return null;

  const set = (fieldId: string, value: string) => {
    setProblems((prev) => {
      if (!(fieldId in prev)) return prev;
      const rest = { ...prev };
      delete rest[fieldId];
      return rest;
    });
    setDraft((prev) => ({ ...prev, [fieldId]: value }));
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { values, problems: refused } = ownCustomFieldFormChanges(
      fields ?? [],
      draft,
    );
    if (Object.keys(refused).length > 0) {
      setProblems(refused);
      return;
    }
    try {
      if (values.length > 0) await update.mutateAsync(values);
      toast({ title: COPY.saved });
    } catch (error) {
      toast({
        title: COPY.saveFailed,
        description: getErrorMessage(
          error,
          "Try again or check your connection.",
        ),
        variant: "destructive",
      });
    }
  }

  return (
    <ProfileSection id="more-details" title={COPY.title} hint={COPY.hint}>
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        {fields.map((field) => (
          <OwnCustomFieldControl
            key={field.field_id}
            field={field}
            value={draft[field.field_id] ?? ""}
            problem={problems[field.field_id] ?? null}
            disabled={update.isPending}
            onChange={(value) => set(field.field_id, value)}
          />
        ))}
        <div className="flex items-center justify-end gap-2">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {COPY.save}
          </Button>
        </div>
      </form>
    </ProfileSection>
  );
}

function OwnCustomFieldControl({
  field,
  value,
  problem,
  disabled,
  onChange,
}: {
  field: OwnCustomField;
  value: string;
  problem: string | null;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = `custom-field-${field.field_id}`;
  const lineId = `${id}-line`;
  const line = (
    <p
      id={lineId}
      role={problem ? "alert" : undefined}
      className={
        problem
          ? "text-caption text-destructive-text"
          : "text-caption text-muted-foreground"
      }
    >
      {problem ?? CUSTOM_FIELD_AUDIENCE_LINE[field.visibility]}
    </p>
  );

  if (field.type === "boolean") {
    // Label, who sees it, and the switch at the row's end, as a settings row.
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <Label htmlFor={id}>{field.label}</Label>
          {line}
        </div>
        <Switch
          id={id}
          checked={value === "true"}
          disabled={disabled}
          aria-describedby={lineId}
          onCheckedChange={(on) => onChange(on ? "true" : "false")}
        />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>{field.label}</Label>
        <Select
          value={value === "" ? NOT_SET : value}
          disabled={disabled}
          onValueChange={(next) => onChange(next === NOT_SET ? "" : next)}
        >
          <SelectTrigger
            id={id}
            className="w-full sm:w-60"
            aria-describedby={lineId}
            aria-invalid={problem ? true : undefined}
          >
            <SelectValue placeholder={COPY.notSet} />
          </SelectTrigger>
          <SelectContent>
            {ownCustomFieldOffersNotSet(field) ? (
              <SelectItem value={NOT_SET}>{COPY.notSet}</SelectItem>
            ) : null}
            {(field.choices ?? []).map((choice) => (
              <SelectItem key={choice} value={choice}>
                {choice}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {line}
      </div>
    );
  }

  const numeric = field.type === "number" || field.type === "decimal";
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{field.label}</Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        className={numeric ? "sm:w-40" : undefined}
        type={field.type === "phone" ? "tel" : "text"}
        inputMode={
          field.type === "phone"
            ? "tel"
            : field.type === "number"
              ? "numeric"
              : field.type === "decimal"
                ? "decimal"
                : undefined
        }
        maxLength={
          field.type === "phone"
            ? PHONE_MAX_LENGTH
            : customFieldTextMaxLength(ownCustomFieldRule(field))
        }
        aria-describedby={lineId}
        aria-invalid={problem ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        // A number reads (518) 555-0142 once the member leaves the field, as
        // the profile's own Phone does.
        onBlur={
          field.type === "phone"
            ? () => value && onChange(formatPhone(value))
            : undefined
        }
      />
      {line}
    </div>
  );
}

/** The section while it loads: its label, hint and two fields. */
function OwnCustomFieldsSkeleton() {
  return (
    <section aria-hidden="true" className="space-y-4">
      <div className="space-y-2">
        <SkeletonSectionLabel width="w-28" />
        <Skeleton className="h-[11px] w-[45%]" />
      </div>
      <SkeletonField />
      <SkeletonField />
    </section>
  );
}
