"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  interestFormErrorCopy,
  usePublicInterestForm,
  useStartInterestFormCode,
  useSubmitInterestForm,
  useVerifyInterestFormCode,
  type InterestFormVerified,
  type PublicInterestForm,
} from "@repo/hooks";
import type { FormQuestion } from "@repo/chat-core/forms";
import {
  chapterInitials,
  INTEREST_FORM_COPY as COPY,
  INTEREST_FORM_CODE_LENGTH,
  INTEREST_FORM_NAME_MAX_LENGTH,
  INTEREST_FORM_PHONE_MAX_LENGTH,
  INTEREST_FORM_REFERRER_MAX_LENGTH,
  interestFormCodeSentLine,
  interestFormDoneLine,
  isPlainSchoolEmail,
} from "@repo/validation";
import { statusOf } from "@repo/api-sdk";
import { QuestionField } from "@/components/chat/form-fill-dialog";
import { CrestTile } from "@/components/layout/crest-tile";
import { Skeleton } from "@/components/shared/async-states";
import { FieldError } from "@/components/shared/short-form";
import { dashboardTableCheckboxClassName } from "@/components/shared/table-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EYEBROW } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

type Answers = Record<string, string | string[] | undefined>;

/**
 * The public interest form (#5977, `spec/behavior/ifc-recruitment.md`
 * § The public page), built for a phone browser: a PNM scans a QR code at
 * a table and is done in under a minute, the way Google Forms and Typeform
 * open from a link with no account. Unlike them, it verifies first, as
 * ChapterBuilder's and CampusDirector's sign-ups do with a school address:
 *
 * 1. the email, and a six-digit code to it; nothing else of the form shows
 *    until the code is entered, so a stranger who types someone's address
 *    learns nothing;
 * 2. the form, filled with what this address last gave;
 * 3. the approved consent text above the button, never behind a link, and
 *    the required "I agree, and I'm 18 or older".
 *
 * Its words are PNM-facing, so it says "recruitment", never a chapter's
 * private word for it.
 */
export function InterestFormPage({
  slug,
  src,
}: {
  slug: string;
  src: string | null;
}) {
  const form = usePublicInterestForm(slug, src);
  const [verified, setVerified] = useState<InterestFormVerified | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (form.isPending) return <FormSkeleton />;
  if (form.isError || !form.data) {
    const missing = statusOf(form.error) === 404;
    return (
      <Notice
        title={missing ? COPY.notFoundTitle : COPY.submitFailed}
        body={missing ? COPY.notFoundBody : null}
      />
    );
  }
  const data = form.data;

  if (done) {
    return (
      <>
        <Hero form={data} />
        <section className="mt-6 space-y-2" aria-live="polite">
          <h2 className="text-title font-bold text-foreground">
            {COPY.doneTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{done}</p>
        </section>
      </>
    );
  }

  if (!data.is_open) {
    return (
      <>
        <Hero form={data} />
        <section className="mt-6 space-y-2">
          <h2 className="text-title font-bold text-foreground">
            {COPY.closedTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{COPY.closedBody}</p>
        </section>
      </>
    );
  }

  return (
    <>
      <Hero form={data} />
      {data.blurb ? (
        <p className="mt-4 whitespace-pre-line text-sm text-foreground">
          {data.blurb}
        </p>
      ) : null}
      <div className="mt-6">
        {verified ? (
          <DetailsStep
            slug={slug}
            form={data}
            verified={verified}
            onRestart={() => setVerified(null)}
            onDone={() => setDone(interestFormDoneLine(data.chapter.name))}
          />
        ) : (
          <VerifyStep slug={slug} form={data} onVerified={setVerified} />
        )}
      </div>
    </>
  );
}

function Hero({ form }: { form: PublicInterestForm }) {
  const { chapter } = form;
  return (
    <header>
      <p className={cn(EYEBROW, "text-accent-text")}>Recruitment</p>
      <div className="mt-3 flex items-center gap-4">
        <CrestTile
          size="card"
          mark={{
            logoUrl: null,
            text: chapter.mark_text ?? chapterInitials(chapter.name),
            source: chapter.mark_text ? "short_name" : "initials",
          }}
        />
        <div className="min-w-0">
          <h1 className="text-balance text-headline font-bold tracking-tight text-foreground">
            {chapter.name}
          </h1>
          {chapter.university ? (
            <p className="truncate text-sm text-muted-foreground">
              {chapter.university}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function Notice({ title, body }: { title: string; body: string | null }) {
  return (
    <section className="my-auto space-y-2">
      <h1 className="text-headline font-bold tracking-tight text-foreground">
        {title}
      </h1>
      {body ? <p className="text-sm text-muted-foreground">{body}</p> : null}
    </section>
  );
}

/** The loaded hero's shape, so nothing jumps when the form lands. */
function FormSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <h1 className="sr-only">Opening the form…</h1>
      <Skeleton className="h-3 w-24" />
      <div className="mt-3 flex items-center gap-4">
        <Skeleton className="h-14 w-14 shrink-0 rounded-[16px]" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <Skeleton className="mt-6 h-10 w-full" />
    </div>
  );
}

function Field({
  label,
  optional,
  error,
  children,
  htmlFor,
}: {
  label: string;
  optional?: boolean;
  error?: string | null;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {optional ? (
          <span className="ml-1.5 font-normal text-muted-foreground">
            {COPY.optional}
          </span>
        ) : null}
      </Label>
      {children}
      {error ? <FieldError id={`${htmlFor}-error`}>{error}</FieldError> : null}
    </div>
  );
}

/** Step 1: the email, then the code. */
function VerifyStep({
  slug,
  form,
  onVerified,
}: {
  slug: string;
  form: PublicInterestForm;
  onVerified: (verified: InterestFormVerified) => void;
}) {
  const id = useId();
  const start = useStartInterestFormCode(slug);
  const verify = useVerifyInterestFormCode(slug);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const school = form.verify.school_name;
  const domain = form.verify.domains[0];

  function send(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    if (!isPlainSchoolEmail(email)) {
      setError(COPY.notAnEmail);
      return;
    }
    start.mutate(email.trim(), {
      onSuccess: (sent) => {
        setSentTo(sent.email);
        setCode("");
      },
      onError: (failure) =>
        setError(interestFormErrorCopy(failure, COPY.sendFailed)),
    });
  }

  function check(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const typed = code.replace(/\s/g, "");
    if (typed.length !== INTEREST_FORM_CODE_LENGTH || !sentTo) {
      setError(COPY.codeIncomplete);
      return;
    }
    verify.mutate(
      { email: sentTo, code: typed },
      {
        onSuccess: onVerified,
        onError: (failure) =>
          setError(interestFormErrorCopy(failure, COPY.verifyFailed)),
      },
    );
  }

  if (!sentTo) {
    return (
      <form className="space-y-4" onSubmit={send} noValidate>
        <Field
          htmlFor={`${id}-email`}
          label={school ? COPY.schoolEmailLabel : COPY.emailLabel}
          error={error}
        >
          <Input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            placeholder={domain ? `you@${domain}` : "you@example.com"}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-email-error` : `${id}-email-hint`}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <p
          id={`${id}-email-hint`}
          className="text-caption text-muted-foreground"
        >
          {COPY.emailHint}
        </p>
        <Button type="submit" disabled={start.isPending}>
          {start.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          {COPY.sendCode}
        </Button>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={check} noValidate>
      <p className="text-sm text-foreground">
        {interestFormCodeSentLine(sentTo)}
      </p>
      <Field htmlFor={`${id}-code`} label={COPY.codeLabel} error={error}>
        <Input
          id={`${id}-code`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={INTEREST_FORM_CODE_LENGTH + 2}
          value={code}
          className="max-w-40 text-center font-mono tracking-[0.3em]"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-code-error` : undefined}
          onChange={(event) => setCode(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={verify.isPending}>
          {verify.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          {COPY.verify}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={start.isPending}
          onClick={() => send()}
        >
          {COPY.resend}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setSentTo(null);
            setError(null);
          }}
        >
          {COPY.useAnotherEmail}
        </Button>
      </div>
    </form>
  );
}

/** Step 2: the fixed fields, the chapter's questions, consent. */
function DetailsStep({
  slug,
  form,
  verified,
  onRestart,
  onDone,
}: {
  slug: string;
  form: PublicInterestForm;
  verified: InterestFormVerified;
  onRestart: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const submit = useSubmitInterestForm(slug);
  const prefill = verified.prefill;
  const [firstName, setFirstName] = useState(prefill?.first_name ?? "");
  const [lastName, setLastName] = useState(prefill?.last_name ?? "");
  const [preferred, setPreferred] = useState(prefill?.preferred_name ?? "");
  const [classYear, setClassYear] = useState(
    prefill?.class_year ? String(prefill.class_year) : "",
  );
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [referrer, setReferrer] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [agree, setAgree] = useState(false);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const questions = form.questions as FormQuestion[];

  function validate(): Record<string, string> {
    const found: Record<string, string> = {};
    if (!firstName.trim() || !lastName.trim()) found.name = COPY.nameRequired;
    if (classYear.trim() && !/^\d{4}$/.test(classYear.trim())) {
      found.classYear = COPY.classYearInvalid;
    }
    if (phone.trim() && phone.replace(/\D/g, "").length < 7) {
      found.phone = COPY.phoneInvalid;
    }
    for (const question of questions) {
      const value = answers[question.id];
      const blank =
        value === undefined ||
        (typeof value === "string" && !value.trim()) ||
        (Array.isArray(value) && value.length === 0);
      if (question.required && blank) found[question.id] = COPY.answerRequired;
    }
    if (!agree) found.agree = COPY.agreeRequired;
    return found;
  }

  function send(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const found = validate();
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    const cleaned: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(answers)) {
      if (value !== undefined) cleaned[key] = value;
    }
    submit.mutate(
      {
        proof: verified.proof,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        preferred_name: preferred.trim() || null,
        class_year: classYear.trim() ? Number(classYear.trim()) : null,
        phone: phone.trim() || null,
        answers: cleaned,
        referrer: form.ask_referrer ? referrer.trim() || null : null,
        source_label: form.source_label,
        agree: true,
      },
      {
        onSuccess: onDone,
        onError: (failure) => {
          const code =
            failure && typeof failure === "object" && "code" in failure
              ? (failure as { code?: unknown }).code
              : null;
          if (code === "interest_form.proof.invalid") {
            onRestart();
            return;
          }
          setError(interestFormErrorCopy(failure, COPY.submitFailed));
        },
      },
    );
  }

  return (
    <form className="space-y-5" onSubmit={send} noValidate>
      <p className="text-sm text-muted-foreground">{verified.email}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field htmlFor={`${id}-first`} label={COPY.firstName}>
          <Input
            id={`${id}-first`}
            autoComplete="given-name"
            value={firstName}
            maxLength={INTEREST_FORM_NAME_MAX_LENGTH}
            aria-invalid={problems.name ? true : undefined}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </Field>
        <Field htmlFor={`${id}-last`} label={COPY.lastName}>
          <Input
            id={`${id}-last`}
            autoComplete="family-name"
            value={lastName}
            maxLength={INTEREST_FORM_NAME_MAX_LENGTH}
            aria-invalid={problems.name ? true : undefined}
            onChange={(event) => setLastName(event.target.value)}
          />
        </Field>
      </div>
      {problems.name ? <FieldError>{problems.name}</FieldError> : null}
      <Field htmlFor={`${id}-preferred`} label={COPY.preferredName} optional>
        <Input
          id={`${id}-preferred`}
          autoComplete="nickname"
          value={preferred}
          maxLength={INTEREST_FORM_NAME_MAX_LENGTH}
          onChange={(event) => setPreferred(event.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field
          htmlFor={`${id}-year`}
          label={COPY.classYear}
          optional
          error={problems.classYear}
        >
          <Input
            id={`${id}-year`}
            inputMode="numeric"
            value={classYear}
            maxLength={4}
            placeholder={String(new Date().getFullYear() + 4)}
            aria-invalid={problems.classYear ? true : undefined}
            onChange={(event) => setClassYear(event.target.value)}
          />
        </Field>
        <Field
          htmlFor={`${id}-phone`}
          label={COPY.phone}
          optional
          error={problems.phone}
        >
          <Input
            id={`${id}-phone`}
            type="tel"
            autoComplete="tel"
            value={phone}
            maxLength={INTEREST_FORM_PHONE_MAX_LENGTH}
            aria-invalid={problems.phone ? true : undefined}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>
      </div>

      {questions.length > 0 ? (
        <ol className="space-y-5">
          {questions.map((question, index) => (
            <QuestionField
              key={question.id}
              index={index}
              question={question}
              value={answers[question.id]}
              onChange={(value) =>
                setAnswers((current) => ({ ...current, [question.id]: value }))
              }
              readOnly={false}
              problem={problems[question.id]}
            />
          ))}
        </ol>
      ) : null}

      {form.ask_referrer ? (
        <Field htmlFor={`${id}-referrer`} label={COPY.referrer} optional>
          <Input
            id={`${id}-referrer`}
            value={referrer}
            maxLength={INTEREST_FORM_REFERRER_MAX_LENGTH}
            placeholder={COPY.referrerHint}
            onChange={(event) => setReferrer(event.target.value)}
          />
        </Field>
      ) : null}

      <p className="text-caption leading-relaxed text-muted-foreground">
        {form.consent.runs.map((run, at) =>
          run.strong ? (
            <strong key={at} className="font-semibold text-foreground">
              {run.text}
            </strong>
          ) : (
            <span key={at}>{run.text}</span>
          ),
        )}
      </p>
      <div className="space-y-1.5">
        <div className="flex items-start gap-3 rounded-lg border border-border p-3">
          <input
            type="checkbox"
            id={`${id}-agree`}
            checked={agree}
            onChange={(event) => setAgree(event.target.checked)}
            aria-invalid={problems.agree ? true : undefined}
            className={cn(dashboardTableCheckboxClassName, "mt-0.5")}
          />
          <Label
            htmlFor={`${id}-agree`}
            className="text-sm font-normal leading-snug text-foreground"
          >
            {form.consent.agree_label}
          </Label>
        </div>
        {problems.agree ? <FieldError>{problems.agree}</FieldError> : null}
      </div>

      {error ? <FieldError>{error}</FieldError> : null}
      <Button type="submit" disabled={submit.isPending}>
        {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {submit.isPending ? COPY.submitting : COPY.submit}
      </Button>
    </form>
  );
}
