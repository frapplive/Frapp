"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  councilStepErrorCopy,
  useAccessibleChapters,
  useCreateCouncil,
  useMySchools,
  type MySchool,
} from "@repo/hooks";
import {
  COUNCIL_CUSTOM_TITLE_KEY,
  COUNCIL_NAME_MAX,
  COUNCIL_PROFILES,
  COUNCIL_TITLE_MAX,
  COUNCIL_TYPES,
  SCHOOL_STEP_COPY,
  defaultCouncilName,
  pickableCouncilTitles,
  type CouncilType,
} from "@repo/validation";
import { AuthScreen } from "@/components/auth/auth-screen";
import { TermsAcceptance } from "@/components/auth/terms-acceptance";
import { useConfirmDropBulkUploads } from "@/components/backwork/bulk/use-confirm-drop-bulk-uploads";
import { InviteComposer } from "@/components/members/invite-composer";
import { SchoolStep } from "@/components/onboarding/school-step";
import { ErrorState, SkeletonText } from "@/components/shared/async-states";
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
import { useSelectChapter } from "@/lib/auth/select-chapter";
import { CREATE_CHAPTER_PATH } from "@/lib/auth/join-visit";
import { asArray } from "@/lib/utils";
import { START_COUNCIL_COPY as COPY } from "@/components/councils/council-copy";

/** Where the founder lands: the new council's chat, as a chapter's does. */
const COUNCIL_LANDING_PATH = "/chat";

/** What the form holds; `name` is `null` until the founder types one. */
export interface CouncilDraft {
  schoolId: string | null;
  type: CouncilType | null;
  name: string | null;
  titleKey: string | null;
  customTitle: string;
  accepted: boolean;
}

export type CouncilDraftField =
  "school" | "type" | "name" | "title" | "customTitle" | "terms";

const EMPTY_DRAFT: CouncilDraft = {
  schoolId: null,
  type: null,
  name: null,
  titleKey: null,
  customTitle: "",
  accepted: false,
};

/**
 * The name field's value: the founder's own once typed, else the type's
 * default at their school ("RPI IFC"), which follows the type they pick.
 */
export function councilNameValue(
  draft: CouncilDraft,
  school: MySchool["school"] | undefined,
): string {
  if (draft.name !== null) return draft.name;
  if (!draft.type || !school) return "";
  return defaultCouncilName(draft.type, school.short_name || school.name);
}

/** The first thing missing, in the form's order, or null when it can go. */
export function councilDraftProblem(
  draft: CouncilDraft,
  name: string,
): { field: CouncilDraftField; message: string } | null {
  if (!draft.schoolId) return { field: "school", message: COPY.noSchool };
  if (!draft.type) return { field: "type", message: COPY.typeRequired };
  if (!name.trim()) return { field: "name", message: COPY.nameRequired };
  if (!draft.titleKey) return { field: "title", message: COPY.titleRequired };
  if (draft.titleKey === COUNCIL_CUSTOM_TITLE_KEY && !draft.customTitle.trim())
    return { field: "customTitle", message: COPY.customTitleRequired };
  if (!draft.accepted) return { field: "terms", message: COPY.termsRequired };
  return null;
}

/**
 * Start a council (#5933; `school-layer.md` § 5.3, Winston's rules): any
 * verified student at a school can start its council of a type the school
 * doesn't have yet, picks their own title, and holds Council admin beside it
 * until the real President takes it.
 *
 * One short form in the house style of the chapter wizard's identity step,
 * on the pre-auth frame `/welcome` uses: the school (the founder's verified
 * one, or a pick when they have several; with none, the school-email step
 * `/welcome` uses, which comes back here), the council type with each
 * profile's one line, the name (offered as "RPI IFC" and following the type
 * until typed over), the founder's title (the type's seeded titles plus
 * Something else, a title of their own), and the Terms checkbox every create
 * shares. Checked on Start, not per keystroke (P4.5).
 *
 * On success the council becomes the active tenant through the same helper
 * chapter creation uses, which refreshes the session, and the next step is
 * the chapter wizard's last: invite, here the council's delegates, or skip,
 * then the council's chat.
 *
 * Comparable flows: Discord's Create a server (a template, the name prefilled
 * from it, then invite), Slack's workspace setup (name, then teammates), and
 * Linear's workspace creation (one form, then invite).
 */
export function StartCouncil() {
  const router = useRouter();
  const schools = useMySchools();
  const memberships = useAccessibleChapters();
  const createCouncil = useCreateCouncil();
  const selectChapter = useSelectChapter();
  const { confirmDrop, confirmDropDialog } = useConfirmDropBulkUploads();
  const [draft, setDraft] = useState<CouncilDraft>(EMPTY_DRAFT);
  const [problem, setProblem] = useState<{
    field: CouncilDraftField;
    message: string;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  // The created council's type, which names the role its invites join as.
  const [created, setCreated] = useState<CouncilType | null>(null);
  // A council that was made but not opened: Start retries the switch rather
  // than making a second one (#5933).
  const [unopened, setUnopened] = useState<{
    id: string;
    name: string;
    type: CouncilType;
  } | null>(null);
  const [invited, setInvited] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const hasTenant = asArray<unknown>(memberships.data).length > 0;
  const footer = hasTenant ? (
    <Link
      href={COUNCIL_LANDING_PATH}
      className="font-semibold text-accent-text hover:underline"
    >
      {COPY.backToChat}
    </Link>
  ) : (
    <p>
      {COPY.startingChapter}{" "}
      <Link
        href={CREATE_CHAPTER_PATH}
        className="font-semibold text-accent-text hover:underline"
      >
        {COPY.createChapter}
      </Link>
    </p>
  );

  function leave() {
    setLeaving(true);
    router.replace(COUNCIL_LANDING_PATH);
    router.refresh();
  }

  if (created) {
    return (
      <AuthScreen title={COPY.inviteTitle}>
        <InviteComposer
          role={delegateRoleName(created)}
          onInvited={() => setInvited(true)}
        />
        <Button
          type="button"
          className="mt-6 w-full"
          onClick={leave}
          disabled={leaving}
          aria-busy={leaving}
        >
          {leaving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          {invited ? COPY.finish : COPY.skip}
        </Button>
      </AuthScreen>
    );
  }

  if (verifying) {
    return (
      <SchoolStep
        initialQuery=""
        doneLabel={SCHOOL_STEP_COPY.continue}
        skipLabel={COPY.schoolBack}
        onLeave={() => {
          setVerifying(false);
          void schools.refetch();
        }}
      />
    );
  }

  if (schools.isPending) {
    return (
      <AuthScreen title={COPY.title} footer={footer}>
        <SkeletonText lines={4} />
      </AuthScreen>
    );
  }

  if (schools.isError && !schools.data) {
    return (
      <AuthScreen title={COPY.title} footer={footer}>
        <ErrorState
          title="Couldn't load your schools"
          description="Frapp couldn't be reached. Try again in a moment."
          onRetry={() => void schools.refetch()}
        />
      </AuthScreen>
    );
  }

  const mine = schools.data ?? [];

  // No verified school: say what it takes and lead to the step that does it.
  if (mine.length === 0) {
    return (
      <AuthScreen title={COPY.title} footer={footer}>
        <p className="text-base text-muted-foreground">{COPY.noSchool}</p>
        <Button
          type="button"
          className="mt-6 w-full"
          onClick={() => setVerifying(true)}
        >
          {COPY.verifySchool}
        </Button>
      </AuthScreen>
    );
  }

  // One school is the school; several are a pick.
  const schoolId =
    draft.schoolId ?? (mine.length === 1 ? mine[0]!.school.id : null);
  const school = mine.find((row) => row.school.id === schoolId)?.school;
  const effective: CouncilDraft = { ...draft, schoolId };
  const name = councilNameValue(effective, school);
  const titles = effective.type ? pickableCouncilTitles(effective.type) : [];
  const busy = createCouncil.isPending;

  function update(patch: Partial<CouncilDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setProblem(null);
    setSubmitError(null);
  }

  async function openCouncil(council: {
    id: string;
    name: string;
    type: CouncilType;
  }) {
    // `useSelectChapter` answers false rather than throwing; moving on would
    // leave the store, and every invite, on the previous tenant.
    if (await selectChapter(council.id)) {
      setUnopened(null);
      setCreated(council.type);
      return;
    }
    setUnopened(council);
    setSubmitError(COPY.openFailed(council.name));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (unopened) {
      setSubmitError(null);
      await openCouncil(unopened);
      return;
    }
    const found = councilDraftProblem(effective, name);
    if (found) {
      setProblem(found);
      document.getElementById(fieldId(found.field))?.focus();
      return;
    }
    if (!(await confirmDrop("switch"))) return;
    const custom = effective.titleKey === COUNCIL_CUSTOM_TITLE_KEY;
    try {
      const council = await createCouncil.mutateAsync({
        school_id: effective.schoolId!,
        council_type: effective.type!,
        name: name.trim(),
        title_key: effective.titleKey!,
        ...(custom ? { custom_title: effective.customTitle.trim() } : {}),
        accept_terms_privacy: true,
      });
      // The new council is the active tenant from here, as a new chapter is.
      await openCouncil({
        id: council.id,
        name: council.name,
        type: effective.type!,
      });
    } catch (error) {
      setSubmitError(councilStepErrorCopy(error, COPY.createFailed));
    }
  }

  const errorFor = (field: CouncilDraftField) =>
    problem?.field === field ? problem.message : null;

  return (
    <AuthScreen title={COPY.title} footer={footer}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void submit(event)}
      >
        <Field
          id={fieldId("school")}
          label={COPY.schoolLabel}
          error={errorFor("school")}
        >
          {mine.length === 1 && school ? (
            <p
              id={fieldId("school")}
              tabIndex={-1}
              className="flex h-10 items-center truncate rounded-md border border-border px-3 text-base text-foreground"
            >
              {school.name}
            </p>
          ) : (
            <Select
              value={schoolId ?? ""}
              onValueChange={(next) => update({ schoolId: next })}
              disabled={busy}
            >
              <SelectTrigger
                id={fieldId("school")}
                aria-invalid={errorFor("school") ? true : undefined}
              >
                <SelectValue placeholder={COPY.schoolLabel} />
              </SelectTrigger>
              <SelectContent>
                {mine.map((row) => (
                  <SelectItem key={row.school.id} value={row.school.id}>
                    {row.school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field
          id={fieldId("type")}
          label={COPY.typeLabel}
          error={errorFor("type")}
        >
          <Select
            value={effective.type ?? ""}
            onValueChange={(next) =>
              // A title picked for another type isn't one this type seeds.
              update({ type: next as CouncilType, titleKey: null })
            }
            disabled={busy}
          >
            <SelectTrigger
              id={fieldId("type")}
              aria-invalid={errorFor("type") ? true : undefined}
            >
              <SelectValue placeholder={COPY.typePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {COUNCIL_TYPES.map((type) => (
                <SelectItem
                  key={type}
                  value={type}
                  description={COUNCIL_PROFILES[type].description}
                >
                  {COUNCIL_PROFILES[type].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          id={fieldId("name")}
          label={COPY.nameLabel}
          error={errorFor("name")}
        >
          <Input
            id={fieldId("name")}
            value={name}
            onChange={(event) => update({ name: event.target.value })}
            maxLength={COUNCIL_NAME_MAX}
            autoComplete="off"
            disabled={busy}
            aria-invalid={errorFor("name") ? true : undefined}
          />
        </Field>

        <Field
          id={fieldId("title")}
          label={COPY.titleLabel}
          error={errorFor("title")}
        >
          <Select
            value={effective.titleKey ?? ""}
            onValueChange={(next) => update({ titleKey: next })}
            disabled={busy || !effective.type}
          >
            <SelectTrigger
              id={fieldId("title")}
              aria-invalid={errorFor("title") ? true : undefined}
            >
              <SelectValue placeholder={COPY.titlePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {titles.map((title) => (
                <SelectItem key={title.key} value={title.key}>
                  {title.name}
                </SelectItem>
              ))}
              <SelectItem value={COUNCIL_CUSTOM_TITLE_KEY}>
                {COPY.somethingElse}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {effective.titleKey === COUNCIL_CUSTOM_TITLE_KEY ? (
          <Field
            id={fieldId("customTitle")}
            label={COPY.customTitleLabel}
            error={errorFor("customTitle")}
          >
            <Input
              id={fieldId("customTitle")}
              value={effective.customTitle}
              onChange={(event) => update({ customTitle: event.target.value })}
              placeholder={COPY.customTitlePlaceholder}
              maxLength={COUNCIL_TITLE_MAX}
              autoComplete="off"
              autoFocus
              disabled={busy}
              aria-invalid={errorFor("customTitle") ? true : undefined}
            />
          </Field>
        ) : null}

        <div className="grid gap-1.5">
          <TermsAcceptance
            id={fieldId("terms")}
            accepted={effective.accepted}
            onAcceptedChange={(accepted) => update({ accepted })}
            disabled={busy}
          />
          <p aria-live="polite" className="min-h-5 text-sm text-destructive">
            {errorFor("terms") ?? submitError}
          </p>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          {unopened ? COPY.open(unopened.name) : COPY.submit}
        </Button>
      </form>
      {confirmDropDialog}
    </AuthScreen>
  );
}

/**
 * The role setup invites join as: the type's Delegate, the `MEMBER` floor a
 * council's delegates hold (`school-layer.md` § 5.3). Seeded by name a moment
 * ago, so the name is still the seed's.
 */
export function delegateRoleName(type: CouncilType): string | undefined {
  return COUNCIL_PROFILES[type].roles.find(
    (role) => role.systemKey === "MEMBER",
  )?.name;
}

function fieldId(field: CouncilDraftField): string {
  return `start-council-${field}`;
}

/** A label, its control, and the line its error appears on once checked. */
function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p aria-live="polite" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
