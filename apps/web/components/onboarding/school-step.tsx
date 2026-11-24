"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  SCHOOL_SEARCH_MIN_LENGTH,
  schoolStepErrorCopy,
  useConfirmSchoolVerification,
  useSchoolSearch,
  useStartSchoolVerification,
  type SchoolSummary,
} from "@repo/hooks";
import {
  SCHOOL_CODE_LENGTH,
  SCHOOL_CODE_RESEND_SECONDS,
  SCHOOL_STEP_COPY,
  schoolCodeSentLine,
  schoolEmailPlaceholder,
  schoolResendWaitLine,
  schoolVerifiedLine,
} from "@repo/validation";
import { AuthScreen } from "@/components/auth/auth-screen";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

type Stage = "pick" | "email" | "code" | "done";

/**
 * "Where do you go to school?", the optional step after a member's name on
 * `/welcome` (#5929; `spec/behavior/onboarding.md` § After joining). Pick the
 * school, type its email, type the six-digit code from that email, and
 * "You're verified at <school>". The phone's s03 draws the same beats in the
 * same words (`apps/mobile/components/onboarding/school-step.tsx`).
 *
 * The school email step works the way Handshake's and Discord Student Hubs'
 * do, and Slack's domain sign-up: only an address on the school's own domain
 * counts, proved by a code sent to it. The code field is sign-in's
 * (`components/join/email-code-sign-in.tsx`): six digits typed or pasted
 * check themselves.
 *
 * `Not a student? Skip for now` leaves at every stage, and a school that
 * can't verify students yet says so and lets the member go on. `onLeave`
 * runs for both, and after the done stage's button.
 */
export function SchoolStep({
  initialQuery,
  onLeave,
}: {
  /** The chapter's school name, so the member's school is usually first. */
  initialQuery: string;
  onLeave: () => void;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [query, setQuery] = useState(initialQuery);
  const [school, setSchool] = useState<SchoolSummary | null>(null);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const lastTried = useRef<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const debounced = useDebouncedValue(query, 250);
  const search = useSchoolSearch(debounced, { enabled: stage === "pick" });
  const start = useStartSchoolVerification();
  const confirm = useConfirmSchoolVerification();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (stage === "code") codeRef.current?.focus();
  }, [stage]);

  function leave() {
    if (leaving) return;
    setLeaving(true);
    onLeave();
  }

  function pick(next: SchoolSummary) {
    setSchool(next);
    setError(null);
    if (next.verifiable) setStage("email");
  }

  async function send() {
    if (!school || start.isPending) return;
    const address = email.trim();
    if (!address.includes("@")) {
      setError(SCHOOL_STEP_COPY.notAnEmail);
      return;
    }
    setError(null);
    try {
      const sent = await start.mutateAsync({
        schoolId: school.id,
        email: address,
      });
      setSentTo(sent.email);
      setCode("");
      lastTried.current = null;
      setCooldown(sent.resend_after_seconds ?? SCHOOL_CODE_RESEND_SECONDS);
      setStage("code");
    } catch (caught) {
      setError(schoolStepErrorCopy(caught, SCHOOL_STEP_COPY.sendFailed));
    }
  }

  async function verify(value: string) {
    if (!school || confirm.isPending || value.length < SCHOOL_CODE_LENGTH) {
      return;
    }
    lastTried.current = value;
    setError(null);
    try {
      await confirm.mutateAsync({ schoolId: school.id, code: value });
      setStage("done");
    } catch (caught) {
      setError(schoolStepErrorCopy(caught, SCHOOL_STEP_COPY.verifyFailed));
      setCode("");
      codeRef.current?.focus();
    }
  }

  const skip = (
    <Button
      type="button"
      variant="ghost"
      className="mt-2 w-full"
      onClick={leave}
      disabled={leaving}
    >
      {SCHOOL_STEP_COPY.skip}
    </Button>
  );

  if (stage === "done" && school) {
    return (
      <AuthScreen title={schoolVerifiedLine(school.name)}>
        <Button
          type="button"
          className="w-full"
          onClick={leave}
          disabled={leaving}
          aria-busy={leaving}
        >
          {leaving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          {SCHOOL_STEP_COPY.goToChat}
        </Button>
      </AuthScreen>
    );
  }

  if ((stage === "email" || stage === "code") && school) {
    return (
      <AuthScreen title={SCHOOL_STEP_COPY.title}>
        <ChosenSchool
          school={school}
          onChange={() => {
            setStage("pick");
            setError(null);
          }}
        />
        {stage === "email" ? (
          <form
            noValidate
            className="mt-4 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="school-email">
                {SCHOOL_STEP_COPY.emailLabel}
              </Label>
              <Input
                id="school-email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder={schoolEmailPlaceholder(school.email_domains)}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                disabled={start.isPending}
                aria-invalid={error ? true : undefined}
                aria-describedby="school-email-error"
              />
              <p
                id="school-email-error"
                aria-live="polite"
                className="min-h-5 text-sm text-destructive"
              >
                {error}
              </p>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={start.isPending}
              aria-busy={start.isPending}
            >
              {start.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {SCHOOL_STEP_COPY.sendCode}
            </Button>
          </form>
        ) : (
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void verify(code);
            }}
          >
            <p className="text-sm text-muted-foreground">
              {schoolCodeSentLine(sentTo)}
            </p>
            <label htmlFor="school-code" className="sr-only">
              {SCHOOL_STEP_COPY.codeLabel}
            </label>
            <Input
              ref={codeRef}
              id="school-code"
              // A machine value read character by character: foundations §7's mono.
              className="h-14 text-center font-mono text-title tracking-[0.5em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              value={code}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "");
                setCode(digits);
                setError(null);
                // Six digits typed or pasted is the answer; never the same
                // wrong code twice.
                if (
                  digits.length === SCHOOL_CODE_LENGTH &&
                  digits !== lastTried.current
                ) {
                  void verify(digits);
                }
              }}
              disabled={confirm.isPending}
              aria-invalid={error ? true : undefined}
              aria-describedby="school-code-error"
            />
            <p
              id="school-code-error"
              aria-live="polite"
              className="min-h-5 text-sm text-destructive"
            >
              {error}
            </p>
            <Button
              type="submit"
              className="w-full"
              disabled={confirm.isPending || code.length < SCHOOL_CODE_LENGTH}
              aria-busy={confirm.isPending}
            >
              {confirm.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {SCHOOL_STEP_COPY.verify}
            </Button>
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={cooldown > 0 || start.isPending}
                onClick={() => void send()}
              >
                {cooldown > 0
                  ? schoolResendWaitLine(cooldown)
                  : SCHOOL_STEP_COPY.resend}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStage("email");
                  setError(null);
                  setCode("");
                }}
              >
                {SCHOOL_STEP_COPY.useAnotherEmail}
              </Button>
            </div>
          </form>
        )}
        {skip}
      </AuthScreen>
    );
  }

  // The pick stage: search, then a row per school.
  const trimmed = debounced.trim();
  const hasQuery = trimmed.length >= SCHOOL_SEARCH_MIN_LENGTH;
  const results = search.data ?? [];
  return (
    <AuthScreen title={SCHOOL_STEP_COPY.title}>
      <Command shouldFilter={false} className="rounded-lg border border-border">
        <CommandInput
          value={query}
          onValueChange={(value) => {
            setQuery(value);
            setSchool(null);
          }}
          placeholder={SCHOOL_STEP_COPY.searchPlaceholder}
          aria-label={SCHOOL_STEP_COPY.searchLabel}
          autoFocus
        />
        <CommandList className="max-h-72">
          {hasQuery && search.isError ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {SCHOOL_STEP_COPY.searchFailed}
            </p>
          ) : null}
          {hasQuery && search.isSuccess && results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {SCHOOL_STEP_COPY.noMatch}
            </p>
          ) : null}
          {results.map((row) => (
            <CommandItem
              key={row.id}
              value={row.id}
              onSelect={() => pick(row)}
              aria-selected={school?.id === row.id}
              className="flex-col items-start gap-0.5 py-2"
            >
              <span className="font-medium">{row.name}</span>
              {row.short_name && row.short_name !== row.name ? (
                <span className="text-xs text-muted-foreground">
                  {row.short_name}
                </span>
              ) : null}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
      {school && !school.verifiable ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {SCHOOL_STEP_COPY.notSetUp}
          </p>
          <Button
            type="button"
            className="w-full"
            onClick={leave}
            disabled={leaving}
          >
            {SCHOOL_STEP_COPY.goToChat}
          </Button>
        </div>
      ) : (
        skip
      )}
    </AuthScreen>
  );
}

/** The picked school, one row, with Change to search again. */
function ChosenSchool({
  school,
  onChange,
}: {
  school: SchoolSummary;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {school.name}
        </p>
        {school.short_name && school.short_name !== school.name ? (
          <p className="truncate text-xs text-muted-foreground">
            {school.short_name}
          </p>
        ) : null}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onChange}>
        {SCHOOL_STEP_COPY.change}
      </Button>
    </div>
  );
}
