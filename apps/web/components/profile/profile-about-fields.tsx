"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { formatPhone, formatPhoneInput } from "@repo/formatting";
import {
  BIRTHDAY_VISIBILITY_DEFAULT,
  type BirthdayDraftProblem,
  GRADUATION_YEAR_MAX,
  GRADUATION_YEAR_MIN,
  MAJOR_MAX_LENGTH,
  majorSuggestions,
  PHONE_INVALID_MESSAGE,
  PHONE_MAX_LENGTH,
  PROFILE_FIELD_COPY,
} from "@repo/validation";
import { BirthdayFields } from "@/components/profile/birthday-fields";
import type { ProfileFields } from "@/components/profile/profile-save-body";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SuggestField } from "@/components/ui/suggest-field";
import { parseGuardedInt } from "@/lib/utils";

/**
 * Phone, Major with Grad year, and Birthday: the block `/profile` edits and
 * `/welcome`'s About you asks (#5284), one component so the two can't drift.
 * What a Save refuses is `profileSaveProblem`'s; this draws it on its field.
 *
 * `onChange` gets only the fields that moved, for the host to merge into its
 * draft.
 */
export function ProfileAboutFields({
  value,
  onChange,
  majors,
  phoneInvalid,
  birthdayProblem,
  disabled = false,
}: {
  value: ProfileFields;
  onChange: (patch: Partial<ProfileFields>) => void;
  /** The chapter's majors, offered under Major (#5778). */
  majors: string[];
  /** The last Save refused the phone. */
  phoneInvalid: boolean;
  /** The last Save's refusal of the birthday; null when none. */
  birthdayProblem: BirthdayDraftProblem | null;
  disabled?: boolean;
}) {
  // Where the Phone field's caret goes once its formatted value renders. It
  // runs after every keystroke, not only when the value changed: a keystroke
  // the formatting undoes (a space mid-number) still has React write the value
  // back, which would throw the caret to the end.
  const phoneInput = useRef<HTMLInputElement>(null);
  const phoneCaret = useRef<number | null>(null);
  const [phoneKeystrokes, setPhoneKeystrokes] = useState(0);
  useLayoutEffect(() => {
    const caret = phoneCaret.current;
    phoneCaret.current = null;
    if (caret === null || !phoneInput.current) return;
    phoneInput.current.setSelectionRange(caret, caret);
  }, [phoneKeystrokes]);

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="phone">{PROFILE_FIELD_COPY.phone.label}</Label>
        <Input
          ref={phoneInput}
          id="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          maxLength={PHONE_MAX_LENGTH}
          value={value.phone ?? ""}
          disabled={disabled}
          aria-invalid={phoneInvalid || undefined}
          aria-describedby="phone-hint"
          onChange={(event) => {
            // Formats as the member types (#5798), keeping the caret among
            // the same digits.
            const inputType = (event.nativeEvent as InputEvent).inputType;
            const typed = formatPhoneInput(
              event.target.value,
              event.target.selectionStart ?? event.target.value.length,
              value.phone ?? "",
              inputType === "deleteContentForward" ? "forward" : "backward",
            );
            phoneCaret.current = typed.caret;
            setPhoneKeystrokes((count) => count + 1);
            onChange({ phone: typed.value });
          }}
          // A 7-digit local number reads `555-0142` once the member leaves
          // the field, not half-grouped as a longer one.
          onBlur={() => {
            if (value.phone && formatPhone(value.phone) !== value.phone) {
              onChange({ phone: formatPhone(value.phone) });
            }
          }}
          placeholder={PROFILE_FIELD_COPY.phone.placeholder}
        />
        <p
          id="phone-hint"
          role={phoneInvalid ? "alert" : undefined}
          className={
            phoneInvalid
              ? "text-caption text-destructive-text"
              : "text-caption text-muted-foreground"
          }
        >
          {phoneInvalid ? PHONE_INVALID_MESSAGE : PROFILE_FIELD_COPY.phone.hint}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <div className="grid gap-2">
          <Label htmlFor="major">{PROFILE_FIELD_COPY.major.label}</Label>
          <SuggestField
            id="major"
            value={value.major ?? ""}
            maxLength={MAJOR_MAX_LENGTH}
            disabled={disabled}
            onChange={(major) => onChange({ major })}
            suggestions={majorSuggestions(majors, value.major ?? "")}
            suggestionsLabel={PROFILE_FIELD_COPY.major.suggestionsLabel}
            placeholder={PROFILE_FIELD_COPY.major.placeholder}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="graduation-year">
            {PROFILE_FIELD_COPY.graduationYear.label}
          </Label>
          <Input
            id="graduation-year"
            aria-label={PROFILE_FIELD_COPY.graduationYear.accessibleLabel}
            type="number"
            inputMode="numeric"
            min={GRADUATION_YEAR_MIN}
            max={GRADUATION_YEAR_MAX}
            value={value.graduation_year ?? ""}
            disabled={disabled}
            placeholder={PROFILE_FIELD_COPY.graduationYear.placeholder}
            onChange={(event) => {
              const raw = event.target.value;
              // Cleared means "no year". The range
              // (`GRADUATION_YEAR_MIN`–`GRADUATION_YEAR_MAX`) is refused at
              // submit, by the input's `min`/`max` and by the API, not here:
              // guarding it on change would refuse the "2" on the way to
              // "2026" (components.md § Text input, "When an error shows").
              const next = raw.trim() === "" ? null : parseGuardedInt(raw);
              if (next === undefined) return;
              onChange({ graduation_year: next });
            }}
          />
        </div>
      </div>
      <BirthdayFields
        value={{
          month: value.birthday_month ?? null,
          day: value.birthday_day ?? null,
          year: value.birthday_year ?? null,
          visibility: value.birthday_visibility ?? BIRTHDAY_VISIBILITY_DEFAULT,
        }}
        problem={birthdayProblem}
        onChange={(next) =>
          onChange({
            birthday_month: next.month,
            birthday_day: next.day,
            birthday_year: next.year,
            birthday_visibility: next.visibility,
          })
        }
      />
    </>
  );
}
