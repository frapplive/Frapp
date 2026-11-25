"use client";

import { useId, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, Plus } from "lucide-react";
import {
  interestFormErrorCopy,
  useAddInterestFormLabel,
  useInterestFormSettings,
  useRemoveInterestFormLabel,
  useReplaceInterestForm,
  useUpdateInterestForm,
  type InterestFormQuestion,
  type InterestFormSettings,
} from "@repo/hooks";
import {
  INTEREST_FORM_BLURB_MAX_LENGTH,
  INTEREST_FORM_LABEL_MAX_LENGTH,
  INTEREST_FORM_LABELS_MAX,
  INTEREST_FORM_SETTINGS_COPY as COPY,
  normalizeInterestFormLabel,
} from "@repo/validation";
import { ProfileSection } from "@/components/profile/profile-section";
import { InlineNote } from "@/components/shared/inline-note";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { ActionMenuButton } from "@/components/shared/row-menu";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/hooks/use-toast";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { InterestFormQuestionsEditor } from "./interest-form-questions";

/** The contacts picker's "nobody else" value. */

/** Where the public page lives: this app's own origin. */
function formUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

/**
 * A QR code for a form link, saved as a PNG named for its label, large
 * enough to print on a table tent (#5977, `ifc-recruitment.md` § Chapter
 * interest forms, "QR").
 */
async function downloadQr(path: string, name: string): Promise<void> {
  const data = await QRCode.toDataURL(formUrl(path), {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  const link = document.createElement("a");
  link.href = data;
  link.download = `${name}-qr.png`;
  link.click();
}

/** Copies the full link, with the shared "Copied" state. */
function CopyLinkButton({ path, name }: { path: string; name: string }) {
  const { copied, copy } = useCopyToClipboard("Couldn't copy the link.");
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={copied ? COPY.copied : `${COPY.copyLink}: ${name}`}
      title={copied ? COPY.copied : COPY.copyLink}
      onClick={() => void copy(formUrl(path))}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

/** Saves the QR code for a link as a PNG. */
function QrButton({ path, name }: { path: string; name: string }) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={`${COPY.downloadQr}: ${name}`}
      title={COPY.downloadQr}
      onClick={() =>
        void downloadQr(path, name).catch(() =>
          toast({
            title: "Couldn't make the QR code.",
            variant: "destructive",
          }),
        )
      }
    >
      <Download className="h-4 w-4" />
    </Button>
  );
}

/**
 * The interest form's settings on the Recruitment module page (#5977,
 * `ifc-recruitment.md` § Where the chapter's settings live): open or closed,
 * its link and a QR code per label, the referrer question, who's told of a
 * submission, the blurb and the chapter's own questions, and replacing the
 * form. Every setting saves on its own (rulebook § 9). `rush:manage` edits;
 * anyone else who can open the pipeline reads.
 */
export function InterestFormSettingsSection({
  canManage,
}: {
  /** `rush:manage`. */
  canManage: boolean;
}) {
  const settings = useInterestFormSettings();
  if (settings.isPending) return null;
  if (settings.isError) {
    return (
      <ProfileSection id="settings-module-rush-form" title={COPY.title}>
        <InlineNote>{COPY.loadFailed}</InlineNote>
      </ProfileSection>
    );
  }
  const data = settings.data;
  if (!data.offered || !data.form) {
    return (
      <ProfileSection id="settings-module-rush-form" title={COPY.title}>
        <InlineNote>{COPY.nphc}</InlineNote>
      </ProfileSection>
    );
  }
  return <FormSettings settings={data} canManage={canManage} />;
}

function FormSettings({
  settings,
  canManage,
}: {
  settings: InterestFormSettings;
  canManage: boolean;
}) {
  const form = settings.form!;
  const update = useUpdateInterestForm();
  const replace = useReplaceInterestForm();
  const { confirm, confirmDialog } = useConfirmDialog();

  function save(body: Parameters<typeof update.mutate>[0]) {
    update.mutate(body, {
      onError: (error) =>
        toast({
          title: interestFormErrorCopy(error, COPY.saveFailed),
          variant: "destructive",
        }),
    });
  }

  async function replaceForm() {
    const ok = await confirm({
      title: "Replace the interest form?",
      description: COPY.replaceConfirm,
      confirmLabel: COPY.replace,
      tone: "destructive",
    });
    if (!ok) return;
    replace.mutate(undefined, {
      onError: (error) =>
        toast({
          title: interestFormErrorCopy(error, COPY.saveFailed),
          variant: "destructive",
        }),
    });
  }

  return (
    <ProfileSection
      id="settings-module-rush-form"
      title={COPY.title}
      hint={canManage ? COPY.intro : COPY.readOnly}
    >
      <div className="space-y-6">
        <SettingsGroup label={COPY.title}>
          <SettingsRow
            label={COPY.open}
            checked={form.is_open}
            disabled={!canManage || update.isPending}
            onCheckedChange={(next) => save({ is_open: next })}
          />
          <SettingsRow
            label={COPY.link}
            control={
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate font-mono text-caption text-muted-foreground">
                  {formUrl(form.path).replace(/^https?:\/\//, "")}
                </span>
                <CopyLinkButton path={form.path} name={COPY.defaultQr} />
                <QrButton path={form.path} name="interest-form" />
              </span>
            }
          />
          <SettingsRow
            label={COPY.askReferrer}
            checked={form.ask_referrer}
            disabled={!canManage || update.isPending}
            onCheckedChange={(next) => save({ ask_referrer: next })}
          />
        </SettingsGroup>

        <BlurbField
          key={form.id}
          blurb={form.blurb}
          disabled={!canManage}
          onSave={(blurb) => save({ blurb })}
        />

        <InterestFormQuestionsEditor
          key={form.id}
          questions={form.questions as InterestFormQuestion[]}
          disabled={!canManage || update.isPending}
          onSave={(questions) => save({ questions })}
        />

        <QrLabels settings={settings} canManage={canManage} />

        {canManage ? (
          <SettingsGroup label={COPY.replace}>
            <SettingsRow
              label={COPY.replace}
              value={form.slug}
              disabled={replace.isPending}
              onClick={() => void replaceForm()}
            />
          </SettingsGroup>
        ) : null}
      </div>
      {confirmDialog}
    </ProfileSection>
  );
}

/** The blurb, saved when the field is left; Escape puts the saved one back. */
function BlurbField({
  blurb,
  disabled,
  onSave,
}: {
  blurb: string | null;
  disabled: boolean;
  onSave: (blurb: string | null) => void;
}) {
  const id = useId();
  const [text, setText] = useState(blurb ?? "");
  const commit = () => {
    const next = text.trim();
    if (next === (blurb ?? "")) return;
    onSave(next || null);
  };
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {COPY.blurb}
      </label>
      <Textarea
        id={id}
        rows={3}
        value={text}
        maxLength={INTEREST_FORM_BLURB_MAX_LENGTH}
        placeholder={COPY.blurbHint}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Escape") setText(blurb ?? "");
        }}
      />
    </div>
  );
}

/** The QR codes: the main link, then one per source label. */
function QrLabels({
  settings,
  canManage,
}: {
  settings: InterestFormSettings;
  canManage: boolean;
}) {
  const id = useId();
  const add = useAddInterestFormLabel();
  const remove = useRemoveInterestFormLabel();
  const [draft, setDraft] = useState("");
  const full = settings.labels.length >= INTEREST_FORM_LABELS_MAX;
  const label = normalizeInterestFormLabel(draft);

  function submit() {
    if (!label) return;
    add.mutate(label, {
      onSuccess: () => setDraft(""),
      onError: (error) =>
        toast({
          title: interestFormErrorCopy(error, COPY.saveFailed),
          variant: "destructive",
        }),
    });
  }

  return (
    <div className="space-y-2">
      <p id={id} className="text-sm font-medium text-foreground">
        {COPY.labels}
      </p>
      {settings.labels.length > 0 ? (
        <SettingsGroup label={COPY.labels}>
          {settings.labels.map((row) => (
            <SettingsRow
              key={row.id}
              label={<span className="font-mono">{row.label}</span>}
              control={
                <span className="flex items-center gap-1">
                  <CopyLinkButton path={row.path} name={row.label} />
                  <QrButton path={row.path} name={row.label} />
                  {canManage ? (
                    <ActionMenuButton
                      label={`More for ${row.label}`}
                      entries={[
                        {
                          type: "item",
                          key: "remove",
                          label: "Remove code",
                          destructive: true,
                          onSelect: () =>
                            remove.mutate(row.id, {
                              onError: (error) =>
                                toast({
                                  title: interestFormErrorCopy(
                                    error,
                                    COPY.saveFailed,
                                  ),
                                  variant: "destructive",
                                }),
                            }),
                        },
                      ]}
                    />
                  ) : null}
                </span>
              }
            />
          ))}
        </SettingsGroup>
      ) : null}
      {canManage && !full ? (
        <form
          className="flex max-w-md items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Input
            aria-labelledby={id}
            value={draft}
            maxLength={INTEREST_FORM_LABEL_MAX_LENGTH}
            placeholder={COPY.labelPlaceholder}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={!label || add.isPending}
          >
            <Plus className="h-4 w-4" />
            {COPY.addLabel}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
