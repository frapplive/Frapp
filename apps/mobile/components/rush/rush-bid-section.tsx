import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import {
  RUSH_BID_WORDS,
  rushBidActions,
  rushBidLines,
  useBidRushCandidate,
  useConfirmRushAcceptance,
  useRecordRushAcceptance,
  useRecordRushDecline,
  useRescindRushBid,
  type RushPipelineAccess,
  type RushPipelineCandidate,
} from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import { RUSH_BID_RESCIND_REASON_MAX } from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { CardButton } from "@/components/chat/chat-card";
import { SectionHeader } from "@/components/list-section";
import {
  SheetBackToClose,
  SheetGrabber,
  SheetHeader,
  SheetScrim,
  SHEET_STACK_BEHAVIOR,
  sheetFieldStyles,
  useSheetBackgroundStyle,
  useSheetClose,
  useSheetVisit,
} from "@/components/sheet-scaffold";
import { useChapterBranding } from "@/lib/chapter-branding";
import { alertFailure } from "@/lib/failure-alert";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * A prospect's bid on the phone (#5973, `ifc-recruitment.md` § Bids):
 * web's panel row in the same words and order (`rushBidLines`,
 * `rushBidActions`, `RUSH_BID_WORDS`). Its state first, then the actions the
 * viewer may take now: Extend bid, Confirm acceptance, Record acceptance (a
 * sheet asking the PNM's email, which only Frapp sees), Record decline (the
 * platform alert first, since it ends the bid), and Rescind bid (a sheet
 * asking why). Drawn for `rush:bid`, or for anyone once a bid exists.
 */
export function RushBidSection({
  candidate,
  access,
  viewerId,
  today,
}: {
  candidate: RushPipelineCandidate;
  access: RushPipelineAccess;
  viewerId: string | null;
  today: string;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const extend = useBidRushCandidate();
  const decline = useRecordRushDecline();
  const confirm = useConfirmRushAcceptance();
  const record = useRecordRushAcceptance();
  const rescind = useRescindRushBid();
  const [sheet, setSheet] = useState<"accept" | "rescind" | null>(null);

  if (!access.bid && candidate.bid_state === "none") return null;
  const lines = rushBidLines(candidate, today);
  const actions = rushBidActions(candidate, access, viewerId);
  const busy =
    extend.isPending ||
    decline.isPending ||
    confirm.isPending ||
    record.isPending ||
    rescind.isPending;
  const fail = (title: string) => (error: unknown) =>
    alertFailure({ title, error });
  const name = candidate.display_name;

  async function onDecline() {
    const ok = await confirmAlert({
      title: `Record that ${name} declined?`,
      body: "This ends the bid. If they change their mind, extend a new one once it's answered.",
      confirmLabel: RUSH_BID_WORDS.recordDecline,
    });
    if (!ok) return;
    decline.mutate(
      { candidateId: candidate.id },
      { onError: fail("Couldn't record the decline") },
    );
  }

  return (
    <>
      <SectionHeader>Bid</SectionHeader>
      <View style={styles.block}>
        <Text style={styles.title}>{lines?.title ?? "No bid yet"}</Text>
        {lines?.detail ? (
          <Text style={styles.muted}>{lines.detail}</Text>
        ) : null}
        <View style={styles.actions}>
          {actions.extend ? (
            <CardButton
              label={RUSH_BID_WORDS.extend}
              variant="secondary"
              disabled={busy}
              onPress={() =>
                extend.mutate(candidate.id, {
                  onError: fail("Couldn't extend the bid"),
                })
              }
            />
          ) : null}
          {actions.confirm ? (
            <CardButton
              label={RUSH_BID_WORDS.confirm}
              variant="secondary"
              disabled={busy}
              onPress={() =>
                confirm.mutate(
                  { candidateId: candidate.id },
                  { onError: fail("Couldn't confirm the acceptance") },
                )
              }
            />
          ) : null}
          {actions.recordAcceptance ? (
            <CardButton
              label={RUSH_BID_WORDS.recordAcceptance}
              variant="secondary"
              disabled={busy}
              onPress={() => setSheet("accept")}
            />
          ) : null}
          {actions.recordDecline ? (
            <CardButton
              label={RUSH_BID_WORDS.recordDecline}
              variant="secondary"
              disabled={busy}
              onPress={() => void onDecline()}
            />
          ) : null}
          {actions.rescind ? (
            <CardButton
              label={RUSH_BID_WORDS.rescind}
              variant="secondary"
              disabled={busy}
              onPress={() => setSheet("rescind")}
            />
          ) : null}
        </View>
      </View>
      {sheet === "accept" ? (
        <RushBidTextSheet
          title={RUSH_BID_WORDS.acceptanceTitle}
          commit={RUSH_BID_WORDS.recordAcceptance}
          field={RUSH_BID_WORDS.acceptanceEmailLabel}
          hint={
            candidate.user_id !== null
              ? RUSH_BID_WORDS.acceptanceLinkedHint
              : RUSH_BID_WORDS.acceptanceEmailHint
          }
          email
          maxLength={320}
          onSubmit={async (value) => {
            await record.mutateAsync({
              candidateId: candidate.id,
              email: value || null,
            });
          }}
          failure="Couldn't record the acceptance"
          onClosed={() => setSheet(null)}
        />
      ) : null}
      {sheet === "rescind" ? (
        <RushBidTextSheet
          title={RUSH_BID_WORDS.rescindTitle}
          commit={RUSH_BID_WORDS.rescind}
          field={RUSH_BID_WORDS.rescindReasonLabel}
          required
          maxLength={RUSH_BID_RESCIND_REASON_MAX}
          onSubmit={async (value) => {
            await rescind.mutateAsync({
              candidateId: candidate.id,
              reason: value,
            });
          }}
          failure="Couldn't rescind the bid"
          onClosed={() => setSheet(null)}
        />
      ) : null}
    </>
  );
}

/**
 * One field and a commit in the header, as New prospect's sheet is: the
 * PNM's email for a recorded acceptance (left empty, nobody is emailed
 * unless they're a linked member), or why a bid is rescinded.
 */
function RushBidTextSheet({
  title,
  commit,
  field,
  hint,
  email = false,
  required = false,
  maxLength,
  onSubmit,
  failure,
  onClosed,
}: {
  title: string;
  commit: string;
  field: string;
  hint?: string;
  email?: boolean;
  required?: boolean;
  maxLength: number;
  onSubmit: (value: string) => Promise<void>;
  failure: string;
  onClosed: () => void;
}) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createSheetStyles(tokens, accent);
  const backgroundStyle = useSheetBackgroundStyle();
  const ref = useRef<BottomSheetModal>(null);
  const closeSheet = useSheetClose(ref);
  const { onAnimate, markClosed, dismiss, visit, isSameVisit } =
    useSheetVisit(ref);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = value.trim();

  useEffect(() => {
    ref.current?.present();
  }, []);

  const submit = async () => {
    if (busy || (required && !trimmed)) return;
    setBusy(true);
    setProblem(null);
    const from = visit();
    try {
      await onSubmit(trimmed);
      if (isSameVisit(from)) dismiss();
    } catch (error) {
      if (isSameVisit(from)) setProblem(errorCopy(error, `${failure}.`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheetModal
      ref={ref}
      stackBehavior={SHEET_STACK_BEHAVIOR}
      enableDynamicSizing
      keyboardBehavior="interactive"
      backgroundStyle={backgroundStyle}
      handleComponent={SheetGrabber}
      backdropComponent={SheetScrim}
      onAnimate={onAnimate}
      onDismiss={() => {
        markClosed();
        onClosed();
      }}
    >
      <SheetBackToClose onClose={closeSheet} />
      <BottomSheetView onAccessibilityEscape={closeSheet} style={styles.body}>
        <SheetHeader
          title={title}
          onCancel={() => {
            if (!busy) dismiss();
          }}
          cancelDisabled={busy}
          action={{
            label: commit,
            accessibilityLabel: commit,
            onPress: () => void submit(),
            disabled: busy || (required && !trimmed),
            accent,
            onAccent: tokens.color.gold.onHouse,
          }}
        />
        <View style={[styles.ring, focused ? styles.ringActive : null]}>
          <BottomSheetTextInput
            value={value}
            onChangeText={(next) => {
              setValue(next);
              if (problem) setProblem(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            editable={!busy}
            autoFocus
            autoCapitalize={email ? "none" : "sentences"}
            autoCorrect={!email}
            keyboardType={email ? "email-address" : "default"}
            placeholder={field}
            placeholderTextColor={tokens.color.text.muted}
            accessibilityLabel={field}
            maxLength={maxLength}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            style={[styles.field, focused ? styles.fieldFocused : null]}
          />
        </View>
        {problem ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {problem}
          </Text>
        ) : hint ? (
          <Text style={styles.hint}>{hint}</Text>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    block: {
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.xs,
    },
    title: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
    },
    muted: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.sm,
    },
  });
}

function createSheetStyles(tokens: SignetTokens, accent: string) {
  const fields = sheetFieldStyles(tokens, accent);
  return StyleSheet.create({
    body: {
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.xl,
      gap: tokens.spacing.md,
    },
    ring: fields.ring,
    ringActive: fields.ringActive,
    field: fields.field,
    fieldFocused: fields.fieldFocused,
    hint: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructiveText,
    },
  });
}
