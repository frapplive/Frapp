import { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  interestFormErrorCopy,
  rushPipelineAccess,
  useInterestFormSettings,
  usePermissionList,
  useUpdateInterestForm,
  type InterestFormQuestion,
} from "@repo/hooks";
import {
  INTEREST_QUESTION_TYPES,
  interestQuestionProblem,
  interestQuestionTypeLabel,
  interestQuestionsToSave,
  isChoiceQuestion,
  newInterestFormId,
  withQuestionType,
} from "@repo/hooks/interest-form-questions";
import {
  FORM_OPTION_LABEL_MAX_LENGTH,
  FORM_QUESTION_TITLE_MAX_LENGTH,
  INTEREST_FORM_SETTINGS_COPY as COPY,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { CloseGlyph, PlusGlyph } from "@/components/control-glyphs";
import { IconButton } from "@/components/icon-button";
import { InlineNote } from "@/components/inline-note";
import {
  ListRow,
  ListRowSkeleton,
  ListSection,
  SectionHeader,
} from "@/components/list-section";
import { OptionSheet } from "@/components/option-sheet";
import { SkeletonRegion } from "@/components/state-block";
import { Toggle } from "@/components/toggle";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import { fieldTypeRole, typeRole, useFrappTheme } from "@/lib/theme";

/**
 * One of the interest form's own questions on the phone (#5977, #6030),
 * pushed from its row on the Interest form screen: its title, its kind, its
 * options for a choice, and whether it's required, as web's question editor
 * lays out each one. Every change saves the whole list on its own (rulebook
 * § 9): a title or option when its field is left, a kind or the switch when
 * it changes, through `interestQuestionsToSave`, which web's editor shares.
 * A question on a topic Frapp never collects is held back with the reason
 * under it, before the server would refuse it. `"new"` is a question not yet
 * asked: it joins the list once it has a title.
 */
export function InterestQuestionPage({
  questionId,
  onGone,
}: {
  questionId: string;
  /** The question was deleted: the screen goes back. */
  onGone: () => void;
}) {
  const access = rushPipelineAccess(usePermissionList());
  const settings = useInterestFormSettings({ enabled: access.view });
  if (settings.isError && !settings.data) {
    return <InlineNote tone="warning">{COPY.loadFailed}</InlineNote>;
  }
  if (!settings.data) {
    return (
      <SkeletonRegion label="Loading the question">
        <ListSection>
          {[0, 1, 2].map((index) => (
            <ListRowSkeleton key={index} index={index} />
          ))}
        </ListSection>
      </SkeletonRegion>
    );
  }
  const saved = (settings.data.form?.questions ?? []) as InterestFormQuestion[];
  const existing = saved.find((question) => question.id === questionId);
  if (questionId !== "new" && !existing) {
    return <InlineNote>This question is gone.</InlineNote>;
  }
  return (
    <QuestionEditor
      key={questionId}
      saved={saved}
      initial={
        existing ?? {
          id: newInterestFormId(),
          type: "short_answer",
          title: "",
          required: false,
        }
      }
      canManage={access.manage}
      onGone={onGone}
    />
  );
}

function QuestionEditor({
  saved,
  initial,
  canManage,
  onGone,
}: {
  saved: readonly InterestFormQuestion[];
  initial: InterestFormQuestion;
  canManage: boolean;
  onGone: () => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const update = useUpdateInterestForm();
  const kindSheet = useRef<BottomSheetModal>(null);
  const [question, setQuestion] = useState(initial);
  const [failed, setFailed] = useState<string | null>(null);
  const muted = tokens.color.text.mutedForeground;
  const problem = interestQuestionProblem(question);
  const choice = isChoiceQuestion(question.type);
  const options = question.options ?? [];

  /** Saves the list with this question as it now is, once it's ready. */
  function commit(next: InterestFormQuestion) {
    setQuestion(next);
    const known = saved.some((each) => each.id === next.id);
    const list = known
      ? saved.map((each) => (each.id === next.id ? next : each))
      : [...saved, next];
    const ready = interestQuestionsToSave(list);
    if (!ready) return;
    setFailed(null);
    update.mutate(
      { questions: ready },
      {
        onError: (error) =>
          setFailed(interestFormErrorCopy(error, COPY.saveFailed)),
      },
    );
  }

  async function deleteQuestion() {
    const known = saved.some((each) => each.id === question.id);
    if (!known) {
      onGone();
      return;
    }
    const ok = await confirmAlert({
      title: "Delete this question?",
      body: "Answers already given to it stay with each prospect.",
      confirmLabel: "Delete question",
      destructive: true,
    });
    if (!ok) return;
    setFailed(null);
    update.mutate(
      { questions: saved.filter((each) => each.id !== question.id) },
      {
        onSuccess: onGone,
        onError: (error) =>
          setFailed(interestFormErrorCopy(error, COPY.saveFailed)),
      },
    );
  }

  const setOption = (id: string, label: string) =>
    setQuestion((prev) => ({
      ...prev,
      options: (prev.options ?? []).map((each) =>
        each.id === id ? { ...each, label } : each,
      ),
    }));

  return (
    <>
      <ListSection>
        <View style={styles.titleRow}>
          <TextInput
            value={question.title}
            onChangeText={(title) =>
              setQuestion((prev) => ({ ...prev, title }))
            }
            onBlur={() => commit(question)}
            editable={canManage}
            multiline
            autoFocus={canManage && !initial.title}
            maxLength={FORM_QUESTION_TITLE_MAX_LENGTH}
            placeholder="Ask a question"
            placeholderTextColor={tokens.color.text.muted}
            accessibilityLabel="Question"
            style={[styles.title, canManage ? null : styles.readOnly]}
          />
        </View>
        <ListRow
          label="Kind"
          value={interestQuestionTypeLabel(question.type)}
          onPress={canManage ? () => kindSheet.current?.present() : undefined}
        />
        <ListRow
          label="Required"
          trailing={
            <Toggle
              value={question.required}
              disabled={!canManage}
              accessibilityLabel="Required"
              onValueChange={(required) => commit({ ...question, required })}
            />
          }
        />
      </ListSection>
      {problem || failed ? (
        <Text accessibilityLiveRegion="polite" style={styles.failed}>
          {problem ?? failed}
        </Text>
      ) : null}

      {choice ? (
        <>
          <SectionHeader>Options</SectionHeader>
          <ListSection>
            {options.map((option, at) => (
              <View key={option.id} style={styles.optionRow}>
                <TextInput
                  value={option.label}
                  onChangeText={(label) => setOption(option.id, label)}
                  onBlur={() => commit(question)}
                  editable={canManage}
                  maxLength={FORM_OPTION_LABEL_MAX_LENGTH}
                  placeholder={`Option ${at + 1}`}
                  placeholderTextColor={tokens.color.text.muted}
                  accessibilityLabel={`Option ${at + 1}`}
                  returnKeyType="done"
                  style={[styles.option, canManage ? null : styles.readOnly]}
                />
                {canManage && options.length > 1 ? (
                  <IconButton
                    label={`Remove option ${at + 1}`}
                    onPress={() =>
                      commit({
                        ...question,
                        options: options.filter(
                          (each) => each.id !== option.id,
                        ),
                      })
                    }
                  >
                    <CloseGlyph color={muted} size={18} />
                  </IconButton>
                ) : null}
              </View>
            ))}
            {canManage ? (
              <ListRow
                label="Add option"
                leading={<PlusGlyph color={muted} />}
                onPress={() =>
                  setQuestion((prev) => ({
                    ...prev,
                    options: [
                      ...(prev.options ?? []),
                      { id: newInterestFormId(), label: "" },
                    ],
                  }))
                }
              />
            ) : null}
          </ListSection>
        </>
      ) : null}

      {canManage ? (
        <ListSection>
          <ListRow
            label="Delete question"
            destructive
            action
            onPress={() => void deleteQuestion()}
          />
        </ListSection>
      ) : null}

      {canManage ? (
        <OptionSheet
          ref={kindSheet}
          title="Kind"
          options={INTEREST_QUESTION_TYPES.map((entry) => ({
            value: entry.type,
            label: entry.label,
          }))}
          selected={question.type}
          onSelect={(type) => {
            if (!type || type === question.type) return;
            commit(
              withQuestionType(question, type as InterestFormQuestion["type"]),
            );
          }}
        />
      ) : null}
    </>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    titleRow: {
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.md,
      minHeight: tokens.touch.minimum,
    },
    title: {
      ...fieldTypeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
    },
    optionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      paddingHorizontal: tokens.spacing.lg,
      minHeight: tokens.touch.minimum,
    },
    option: {
      ...fieldTypeRole(tokens.typography.role.label),
      flex: 1,
      color: tokens.color.text.foreground,
    },
    readOnly: { color: tokens.color.text.muted },
    failed: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructiveText,
      paddingHorizontal: tokens.spacing.xs,
    },
  });
}
