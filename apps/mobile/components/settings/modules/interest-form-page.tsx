import { forwardRef, useRef, useState } from "react";
import { Share, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import {
  interestFormErrorCopy,
  rushPipelineAccess,
  useAddInterestFormLabel,
  useInterestFormSettings,
  usePermissionList,
  useRemoveInterestFormLabel,
  useReplaceInterestForm,
  useUpdateInterestForm,
  type InterestFormQuestion,
  type InterestFormSettings,
} from "@repo/hooks";
import {
  interestQuestionProblem,
  interestQuestionTypeLabel,
} from "@repo/hooks/interest-form-questions";
import {
  INTEREST_FORM_BLURB_MAX_LENGTH,
  INTEREST_FORM_LABEL_MAX_LENGTH,
  INTEREST_FORM_LABELS_MAX,
  INTEREST_FORM_QUESTIONS_MAX,
  INTEREST_FORM_SETTINGS_COPY as COPY,
  normalizeInterestFormLabel,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { PlusGlyph } from "@/components/control-glyphs";
import { InlineNote } from "@/components/inline-note";
import { openItemMenu, pressAt } from "@/components/item-actions-menu";
import {
  ListPanel,
  ListRow,
  ListRowSkeleton,
  ListSection,
  SectionHeader,
} from "@/components/list-section";
import { FormHint } from "@/components/settings/chapter-form";
import {
  SheetBackToClose,
  SheetGrabber,
  SheetHeader,
  SheetScrim,
  SHEET_STACK_BEHAVIOR,
  useSheetBackgroundStyle,
  useSheetClose,
} from "@/components/sheet-scaffold";
import { SkeletonRegion } from "@/components/state-block";
import { Toggle } from "@/components/toggle";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import { webAppOrigin } from "@/lib/onboarding/chapter-wizard/invite-link";
import {
  MONO_FONT_FAMILY,
  fieldTypeRole,
  typeRole,
  useFrappTheme,
} from "@/lib/theme";

/** The public form lives on the web app (`/f/<slug>`, ADR-27). */
const formUrl = (path: string) => `${webAppOrigin()}${path}`;
const shownUrl = (path: string) => formUrl(path).replace(/^https?:\/\//, "");

/**
 * Recruitment → Interest form on the phone (#5977, #6030), web's
 * `InterestFormSettingsSection` in the phone's rows and words
 * (`INTEREST_FORM_SETTINGS_COPY`): taking interest or not, its link and a QR
 * code per place it's shared, "Who referred you?", the blurb, the chapter's
 * own questions (each a row pushing its editor), and replacing the form.
 * Everything saves on its own (rulebook § 9); a failed save says why in the
 * line under it. `rush:manage` edits; anyone else who can open the pipeline
 * reads. A link opens the glass menu: Share, Copy, or Show the QR code, large
 * enough for a PNM to scan at the table.
 */
export function InterestFormPage({
  onOpenQuestion,
}: {
  /** Pushes a question's editor; `"new"` for a question not yet asked. */
  onOpenQuestion: (questionId: string) => void;
}) {
  const access = rushPipelineAccess(usePermissionList());
  const settings = useInterestFormSettings({ enabled: access.view });
  if (settings.isError && !settings.data) {
    return <InlineNote tone="warning">{COPY.loadFailed}</InlineNote>;
  }
  if (!settings.data) {
    return (
      <SkeletonRegion label="Loading the interest form">
        <ListSection>
          {[0, 1, 2].map((index) => (
            <ListRowSkeleton key={index} index={index} />
          ))}
        </ListSection>
      </SkeletonRegion>
    );
  }
  if (!settings.data.offered || !settings.data.form) {
    return <InlineNote>{COPY.nphc}</InlineNote>;
  }
  return (
    <FormSettings
      settings={settings.data}
      canManage={access.manage}
      onOpenQuestion={onOpenQuestion}
    />
  );
}

type Failure = { part: string; message: string } | null;

function FormSettings({
  settings,
  canManage,
  onOpenQuestion,
}: {
  settings: InterestFormSettings;
  canManage: boolean;
  onOpenQuestion: (questionId: string) => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const form = settings.form!;
  const update = useUpdateInterestForm();
  const replace = useReplaceInterestForm();
  const add = useAddInterestFormLabel();
  const remove = useRemoveInterestFormLabel();
  const qrSheet = useRef<BottomSheetModal>(null);
  const [qr, setQr] = useState<{ title: string; path: string } | null>(null);
  const [failed, setFailed] = useState<Failure>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const muted = tokens.color.text.mutedForeground;
  const questions = form.questions as InterestFormQuestion[];

  const fail = (part: string) => (error: unknown) =>
    setFailed({ part, message: interestFormErrorCopy(error, COPY.saveFailed) });
  const lineFor = (part: string, otherwise?: string | null) =>
    failed?.part === part ? failed.message : (otherwise ?? null);
  const toneFor = (part: string) =>
    failed?.part === part ? ("destructive" as const) : ("default" as const);

  function save(part: string, body: Parameters<typeof update.mutate>[0]) {
    setFailed(null);
    update.mutate(body, { onError: fail(part) });
  }

  function linkMenu(
    key: string,
    title: string,
    path: string,
    event?: Parameters<typeof pressAt>[0],
    extra: Parameters<typeof openItemMenu>[0]["actions"] = [],
  ) {
    const url = formUrl(path);
    openItemMenu(
      {
        title,
        message: shownUrl(path),
        actions: [
          {
            key: "share",
            label: "Share link",
            run: () => void Share.share({ message: url, url }),
          },
          {
            key: "copy",
            label: COPY.copyLink,
            run: () =>
              void Clipboard.setStringAsync(url).then(() => setCopied(key)),
          },
          {
            key: "qr",
            label: "Show QR code",
            run: () => {
              setQr({ title, path });
              qrSheet.current?.present();
            },
          },
          ...extra,
        ],
      },
      pressAt(event),
    );
  }

  async function replaceForm() {
    const ok = await confirmAlert({
      title: "Replace the interest form?",
      body: COPY.replaceConfirm,
      confirmLabel: COPY.replace,
      destructive: true,
    });
    if (!ok) return;
    setFailed(null);
    replace.mutate(undefined, { onError: fail("replace") });
  }

  return (
    <>
      <FormHint>{canManage ? COPY.intro : COPY.readOnly}</FormHint>
      <ListSection>
        <ListRow
          label={COPY.open}
          description={lineFor("open")}
          descriptionTone={toneFor("open")}
          trailing={
            <Toggle
              value={form.is_open}
              disabled={!canManage || update.isPending}
              accessibilityLabel={COPY.open}
              onValueChange={(next) => save("open", { is_open: next })}
            />
          }
        />
        <ListRow
          label={COPY.link}
          value={copied === "main" ? COPY.copied : shownUrl(form.path)}
          accessibilityHint="Opens share, copy and the QR code."
          onPress={(event) =>
            linkMenu("main", COPY.defaultQr, form.path, event)
          }
        />
        <ListRow
          label={COPY.askReferrer}
          description={lineFor("referrer")}
          descriptionTone={toneFor("referrer")}
          trailing={
            <Toggle
              value={form.ask_referrer}
              disabled={!canManage || update.isPending}
              accessibilityLabel={COPY.askReferrer}
              onValueChange={(next) => save("referrer", { ask_referrer: next })}
            />
          }
        />
      </ListSection>

      <SectionHeader>{COPY.blurb}</SectionHeader>
      <BlurbField
        key={form.id}
        blurb={form.blurb}
        editable={canManage}
        failure={lineFor("blurb")}
        onSave={(blurb) => save("blurb", { blurb })}
      />

      <SectionHeader>{COPY.questions}</SectionHeader>
      <FormHint>{COPY.questionsHint}</FormHint>
      <ListSection>
        {questions.map((question) => {
          const problem = interestQuestionProblem(question);
          return (
            <ListRow
              key={question.id}
              label={question.title}
              value={interestQuestionTypeLabel(question.type)}
              description={problem ?? (question.required ? "Required" : null)}
              descriptionTone={problem ? "destructive" : "default"}
              accessibilityHint="Opens the question."
              onPress={() => onOpenQuestion(question.id)}
            />
          );
        })}
        {canManage && questions.length < INTEREST_FORM_QUESTIONS_MAX ? (
          <ListRow
            label={COPY.addQuestion}
            leading={<PlusGlyph color={muted} />}
            accessibilityHint="Opens a new question."
            onPress={() => onOpenQuestion("new")}
          />
        ) : null}
        {!canManage && questions.length === 0 ? (
          <ListRow label="No questions of your own" variant="detail" />
        ) : null}
      </ListSection>

      <SectionHeader>{COPY.labels}</SectionHeader>
      <FormHint>{COPY.labelsHint}</FormHint>
      <ListSection footnote={lineFor("labels")}>
        {settings.labels.map((row) => (
          <ListRow
            key={row.id}
            label={row.label}
            value={copied === row.id ? COPY.copied : null}
            accessibilityHint="Opens share, copy and the QR code."
            onPress={(event) =>
              linkMenu(
                row.id,
                row.label,
                row.path,
                event,
                canManage
                  ? [
                      {
                        key: "remove",
                        label: "Remove code",
                        destructive: true,
                        run: () => {
                          setFailed(null);
                          remove.mutate(row.id, { onError: fail("labels") });
                        },
                      },
                    ]
                  : [],
              )
            }
          />
        ))}
        {canManage && settings.labels.length < INTEREST_FORM_LABELS_MAX ? (
          <LabelField
            busy={add.isPending}
            onAdd={(label, done) => {
              setFailed(null);
              add.mutate(label, { onSuccess: done, onError: fail("labels") });
            }}
          />
        ) : null}
      </ListSection>

      {canManage ? (
        <ListSection footnote={lineFor("replace")}>
          <ListRow
            label={COPY.replace}
            value={form.slug}
            destructive
            action
            busy={replace.isPending}
            onPress={() => void replaceForm()}
          />
        </ListSection>
      ) : null}

      <QrSheet ref={qrSheet} target={qr} styles={styles} />
    </>
  );
}

/** The blurb, saved when the field is left. */
function BlurbField({
  blurb,
  editable,
  failure,
  onSave,
}: {
  blurb: string | null;
  editable: boolean;
  failure: string | null;
  onSave: (blurb: string | null) => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const [text, setText] = useState(blurb ?? "");
  return (
    <>
      <ListPanel>
        <TextInput
          value={text}
          onChangeText={setText}
          onBlur={() => {
            const next = text.trim();
            if (next === (blurb ?? "")) return;
            onSave(next || null);
          }}
          editable={editable}
          multiline
          maxLength={INTEREST_FORM_BLURB_MAX_LENGTH}
          placeholder={COPY.blurbHint}
          placeholderTextColor={tokens.color.text.muted}
          accessibilityLabel={COPY.blurb}
          style={[styles.blurb, editable ? null : styles.readOnly]}
        />
      </ListPanel>
      {failure ? <Text style={styles.failed}>{failure}</Text> : null}
    </>
  );
}

/** A new QR code's label, added on Done. */
function LabelField({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (label: string, done: () => void) => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const [draft, setDraft] = useState("");
  const label = normalizeInterestFormLabel(draft);
  return (
    <View style={styles.addRow}>
      <PlusGlyph color={tokens.color.text.mutedForeground} />
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={() => {
          if (label && !busy) onAdd(label, () => setDraft(""));
        }}
        editable={!busy}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={INTEREST_FORM_LABEL_MAX_LENGTH}
        placeholder={`${COPY.addLabel}: ${COPY.labelPlaceholder}`}
        placeholderTextColor={tokens.color.text.muted}
        returnKeyType="done"
        accessibilityLabel={COPY.addLabel}
        style={styles.addField}
      />
    </View>
  );
}

/**
 * A link's QR code, large and dark on white whatever the theme, so a phone
 * held up at a table scans it (host check-in's code is drawn the same way).
 */
const QrSheet = forwardRef<
  BottomSheetModal,
  {
    target: { title: string; path: string } | null;
    styles: ReturnType<typeof createStyles>;
  }
>(function QrSheet({ target, styles }, ref) {
  const closeSheet = useSheetClose(ref);
  const backgroundStyle = useSheetBackgroundStyle();
  return (
    <BottomSheetModal
      ref={ref}
      stackBehavior={SHEET_STACK_BEHAVIOR}
      enableDynamicSizing
      backgroundStyle={backgroundStyle}
      handleComponent={SheetGrabber}
      backdropComponent={SheetScrim}
    >
      <SheetBackToClose onClose={closeSheet} />
      <BottomSheetView style={styles.sheet} onAccessibilityEscape={closeSheet}>
        <SheetHeader title={target?.title ?? COPY.defaultQr} />
        {target ? (
          <>
            <View
              style={styles.qr}
              accessible
              accessibilityLabel={`QR code for ${shownUrl(target.path)}`}
            >
              <QRCode
                value={formUrl(target.path)}
                size={240}
                // Explicit, not inherited: a code scans dark on light.
                color="#000000"
                backgroundColor="#FFFFFF"
              />
            </View>
            <Text style={styles.qrUrl}>{shownUrl(target.path)}</Text>
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    blurb: {
      ...fieldTypeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
      minHeight: tokens.touch.minimum * 2,
      textAlignVertical: "top",
    },
    readOnly: { color: tokens.color.text.muted },
    failed: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructiveText,
      paddingHorizontal: tokens.spacing.xs,
    },
    addRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      paddingHorizontal: tokens.spacing.lg,
      minHeight: tokens.touch.minimum,
    },
    addField: {
      ...fieldTypeRole(tokens.typography.role.label),
      flex: 1,
      color: tokens.color.text.foreground,
      fontFamily: MONO_FONT_FAMILY,
    },
    sheet: {
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.xl,
      gap: tokens.spacing.md,
      alignItems: "center",
    },
    qr: {
      padding: tokens.spacing.lg,
      borderRadius: tokens.radius.card,
      backgroundColor: "#FFFFFF",
    },
    qrUrl: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
      fontFamily: MONO_FONT_FAMILY,
    },
  });
}
