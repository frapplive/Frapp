import { useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  useCreateCustomField,
  useCustomFields,
  useDeleteCustomField,
  usePermissionList,
  useUpdateCustomField,
  type UpdateCustomFieldInput,
} from "@repo/hooks";
import { describeLoadFailure, errorCopy } from "@repo/hooks/error-copy";
import {
  can,
  deleteMemberFieldConfirm,
  MEMBER_FIELD_LABEL_MAX_LENGTH,
  MEMBER_FIELD_TYPE_LABEL,
  MEMBER_FIELD_VISIBILITY_LABEL,
  MEMBER_FIELDS_COPY,
  PEOPLE_SETTINGS_COPY,
  type ChapterCustomField,
  type CustomFieldType,
  type CustomFieldVisibility,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { ScreenShell } from "@/components/screen-shell";
import { HeaderButton } from "@/components/header-button";
import {
  CheckGlyph,
  CloseGlyph,
  MoreGlyph,
  PlusGlyph,
} from "@/components/control-glyphs";
import { IconButton } from "@/components/icon-button";
import {
  itemMenuAccessibility,
  longPressOf,
  openItemMenu,
  useItemMenu,
  type ItemMenuAction,
} from "@/components/item-actions-menu";
import {
  ListRow,
  ListRowSkeleton,
  ListSection,
  SectionHeader,
} from "@/components/list-section";
import { OptionSheet } from "@/components/option-sheet";
import { NameSheet } from "@/components/roles/name-sheet";
import {
  ChapterTextField,
  FormFields,
} from "@/components/settings/chapter-form";
import { FieldTypeGlyph } from "@/components/settings/field-type-glyph";
import { SavedTextField } from "@/components/settings/saved-text-field";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import {
  TaskActionBar,
  TaskActionBarSpacer,
  TaskBarPill,
} from "@/components/tasks/task-action-bar";
import { Toggle } from "@/components/toggle";
import { useChapterBranding } from "@/lib/chapter-branding";
import { useKeptSheetDraft, useKeptSheetOpening } from "@/lib/kept-sheet-draft";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import {
  addChoice,
  choiceProblem,
  createFieldBody,
  EMPTY_FIELD_DRAFT,
  MAX_LENGTH_INVALID,
  MEMBER_FIELD_TYPES,
  MEMBER_FIELD_VISIBILITIES,
  moveChoice,
  newFieldBlocker,
  parseMaxLength,
  withChoices,
  withMaxLength,
  type NewFieldDraft,
} from "@/lib/settings/member-fields";
import { typeRole, useFrappTheme } from "@/lib/theme";

/** A field's name: the API takes up to this many characters. */

const BACK_TO_MEMBER_FIELDS = {
  label: MEMBER_FIELDS_COPY.pageTitle,
  href: "/member-fields",
} as const;

/** Where a new field's draft is kept while its page is left (#4593). */
const NEW_FIELD_DRAFT = "member-field:new";

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * One member field on the phone (#6029), pushed from Chapter settings →
 * Member fields, in web's rows and words: the name on top, then Type, Options
 * (pick-one only), Longest answer (text only), Visible to, Required and
 * Sensitive.
 *
 * An existing field saves each row on its own (rulebook § 9): the name and
 * the longest answer on Done or leaving the field, a pick or a switch the
 * moment it changes, each option as it is added, moved or taken out. Its
 * type is fixed once made, so Type is a plain value. Delete is in the
 * header's ⋯.
 *
 * `?new=1` is a new field: the same rows, held on the page (and kept when it
 * is left, as web keeps its form), with Type a picker, committed by "Add
 * field" in the floating glass bar, which stays dimmed and says what's
 * missing ("Add a name first", "Add an option first") until it can go.
 *
 * Writes need `chapter-config:manage`; anyone else reads the rows unchanged.
 */
export default function MemberFieldScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    new?: string | string[];
  }>();
  const permissions = usePermissionList();
  const canManage = can("chapter-config:manage", permissions);
  const fieldsQuery = useCustomFields();
  if (firstParam(params.new) === "1") {
    return <NewField fields={fieldsQuery.data ?? null} canManage={canManage} />;
  }
  const id = firstParam(params.id);
  const field = fieldsQuery.data?.find((entry) => entry.id === id) ?? null;
  if (fieldsQuery.isError && fieldsQuery.data === undefined) {
    return (
      <ScreenShell back={BACK_TO_MEMBER_FIELDS} title="Member field">
        <ErrorState
          title="Couldn't load this field"
          body={describeLoadFailure(fieldsQuery.error)}
          onRetry={() => void fieldsQuery.refetch()}
          isRetrying={fieldsQuery.isFetching}
        />
      </ScreenShell>
    );
  }
  if (!fieldsQuery.isSuccess) {
    return (
      <ScreenShell back={BACK_TO_MEMBER_FIELDS} title="Member field">
        <FieldSkeleton />
      </ScreenShell>
    );
  }
  if (!field) {
    return (
      <ScreenShell back={BACK_TO_MEMBER_FIELDS} title="Member field">
        <ErrorState
          title="This field is gone"
          body="Someone may have deleted it. Go back to Member fields to see them as they are now."
        />
      </ScreenShell>
    );
  }
  return <ExistingField key={field.id} field={field} canManage={canManage} />;
}

function FieldSkeleton() {
  const { tokens } = useFrappTheme();
  return (
    <SkeletonRegion
      label="Loading the field"
      style={{ gap: tokens.spacing.lg }}
    >
      <ListSection>
        {[0, 1, 2, 3, 4].map((index) => (
          <ListRowSkeleton key={index} index={index} variant="detail" />
        ))}
      </ListSection>
    </SkeletonRegion>
  );
}

/** The rows both a new field and an existing one draw, in web's order. */
function FieldRows({
  type,
  typeEditable,
  choices,
  maxLengthField,
  visibility,
  required,
  sensitive,
  editable,
  onType,
  onChoices,
  onVisibility,
  onRequired,
  onSensitive,
}: {
  type: CustomFieldType;
  typeEditable: boolean;
  choices: readonly string[];
  /** The Longest answer field, drawn for a text field. */
  maxLengthField: React.ReactNode;
  visibility: CustomFieldVisibility;
  required: boolean;
  sensitive: boolean;
  editable: boolean;
  onType: (next: CustomFieldType) => void;
  /** Resolves the failure to say, or `null` once the options are kept. */
  onChoices: (next: string[]) => Promise<string | null>;
  onVisibility: (next: CustomFieldVisibility) => void;
  onRequired: (next: boolean) => void;
  onSensitive: (next: boolean) => void;
}) {
  const { tokens } = useFrappTheme();
  const glyphColor = tokens.color.text.mutedForeground;
  const typeRef = useRef<BottomSheetModal>(null);
  const visibilityRef = useRef<BottomSheetModal>(null);
  const addOptionRef = useRef<BottomSheetModal>(null);
  const itemMenu = useItemMenu();
  const [optionFailure, setOptionFailure] = useState<string | null>(null);

  async function setChoices(next: string[]) {
    setOptionFailure(await onChoices(next));
  }

  function optionMenu(choice: string, index: number) {
    if (!editable) return null;
    const step = (by: -1 | 1) => () => {
      const next = moveChoice(choices, index, by);
      if (next) void setChoices(next);
    };
    const actions: ItemMenuAction[] = [
      ...(index > 0
        ? [{ key: "up", label: PEOPLE_SETTINGS_COPY.moveUp, run: step(-1) }]
        : []),
      ...(index < choices.length - 1
        ? [{ key: "down", label: PEOPLE_SETTINGS_COPY.moveDown, run: step(1) }]
        : []),
      // A pick-one field keeps at least one option.
      ...(choices.length > 1
        ? [
            {
              key: "remove",
              label: "Remove",
              destructive: true,
              run: () =>
                void setChoices(choices.filter((_, at) => at !== index)),
            },
          ]
        : []),
    ];
    return itemMenu.handleFor({ title: choice, actions });
  }

  return (
    <>
      <ListSection>
        <ListRow
          label={MEMBER_FIELDS_COPY.type}
          leading={<FieldTypeGlyph type={type} color={glyphColor} />}
          value={MEMBER_FIELD_TYPE_LABEL[type]}
          variant={typeEditable ? "default" : "detail"}
          onPress={
            typeEditable && editable
              ? () => typeRef.current?.present()
              : undefined
          }
        />
        <ListRow
          label={MEMBER_FIELDS_COPY.visibleTo}
          value={MEMBER_FIELD_VISIBILITY_LABEL[visibility]}
          onPress={
            editable ? () => visibilityRef.current?.present() : undefined
          }
        />
        <ListRow
          label={MEMBER_FIELDS_COPY.required}
          trailing={
            <Toggle
              value={required}
              disabled={!editable}
              onValueChange={onRequired}
              accessibilityLabel={MEMBER_FIELDS_COPY.required}
            />
          }
        />
        <ListRow
          label={MEMBER_FIELDS_COPY.sensitive}
          trailing={
            <Toggle
              value={sensitive}
              disabled={!editable}
              onValueChange={onSensitive}
              accessibilityLabel={MEMBER_FIELDS_COPY.sensitive}
            />
          }
        />
      </ListSection>

      {type === "text" ? maxLengthField : null}

      {type === "select" ? (
        <>
          <SectionHeader count={choices.length > 0 ? choices.length : null}>
            {MEMBER_FIELDS_COPY.options}
          </SectionHeader>
          <ListSection footnote={optionFailure}>
            {choices.length === 0 ? (
              <ListRow label={MEMBER_FIELDS_COPY.noOptions} variant="detail" />
            ) : null}
            {choices.map((choice, index) => {
              const menu = optionMenu(choice, index);
              return (
                <ListRow
                  key={choice}
                  label={choice}
                  onLongPress={longPressOf(menu)}
                  {...itemMenuAccessibility(menu)}
                  trailing={
                    editable && choices.length > 1 ? (
                      <IconButton
                        label={`Remove ${choice}`}
                        onPress={() =>
                          void setChoices(
                            choices.filter((_, at) => at !== index),
                          )
                        }
                      >
                        <CloseGlyph color={glyphColor} />
                      </IconButton>
                    ) : undefined
                  }
                />
              );
            })}
            {editable ? (
              <ListRow
                label={MEMBER_FIELDS_COPY.addOption}
                leading={<PlusGlyph color={glyphColor} />}
                action
                accessibilityHint="Names an option, added at the end."
                onPress={() => addOptionRef.current?.present()}
              />
            ) : null}
          </ListSection>
        </>
      ) : null}

      {itemMenu.element}
      {editable && typeEditable ? (
        <OptionSheet
          ref={typeRef}
          title={MEMBER_FIELDS_COPY.type}
          options={MEMBER_FIELD_TYPES.map((value) => ({
            value,
            label: MEMBER_FIELD_TYPE_LABEL[value],
            mark: <FieldTypeGlyph type={value} color={glyphColor} />,
          }))}
          selected={type}
          onSelect={(value) => {
            if (value) onType(value as CustomFieldType);
          }}
        />
      ) : null}
      {editable ? (
        <OptionSheet
          ref={visibilityRef}
          title={MEMBER_FIELDS_COPY.visibleTo}
          options={MEMBER_FIELD_VISIBILITIES.map((value) => ({
            value,
            label: MEMBER_FIELD_VISIBILITY_LABEL[value],
          }))}
          selected={visibility}
          onSelect={(value) => {
            if (value) onVisibility(value as CustomFieldVisibility);
          }}
        />
      ) : null}
      {editable && type === "select" ? (
        <NameSheet
          ref={addOptionRef}
          title={MEMBER_FIELDS_COPY.addOption}
          submitLabel={MEMBER_FIELDS_COPY.addOption}
          placeholder="Medium"
          fieldLabel={MEMBER_FIELDS_COPY.addOption}
          maxLength={MEMBER_FIELD_LABEL_MAX_LENGTH}
          onSubmit={async (typed) => {
            const problem = choiceProblem(choices, typed);
            if (problem) return problem;
            const failed = await onChoices(addChoice(choices, typed));
            setOptionFailure(null);
            return failed;
          }}
        />
      ) : null}
    </>
  );
}

function ExistingField({
  field,
  canManage,
}: {
  field: ChapterCustomField;
  canManage: boolean;
}) {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const update = useUpdateCustomField();
  const remove = useDeleteCustomField();
  const [failure, setFailure] = useState<string | null>(null);
  const [maxLengthFailure, setMaxLengthFailure] = useState<string | null>(null);

  async function save(
    body: UpdateCustomFieldInput,
    onFail: (message: string) => void = setFailure,
  ): Promise<boolean> {
    setFailure(null);
    try {
      await update.mutateAsync({ id: field.id, body });
      return true;
    } catch (error) {
      onFail(
        `Couldn't change ${field.label}. ${errorCopy(error, "Try again in a moment.", { serverWritesForMembers: true })}`,
      );
      return false;
    }
  }

  async function deleteField() {
    const confirm = deleteMemberFieldConfirm(field.label);
    const ok = await confirmAlert({
      title: confirm.title,
      body: confirm.body,
      confirmLabel: confirm.action,
      destructive: true,
    });
    if (!ok) return;
    setFailure(null);
    try {
      await remove.mutateAsync(field.id);
      router.back();
    } catch (error) {
      setFailure(
        `Couldn't delete ${field.label}. ${errorCopy(error, "Try again in a moment.", { serverWritesForMembers: true })}`,
      );
    }
  }

  const maxLength = field.options?.max_length;

  return (
    <ScreenShell
      back={BACK_TO_MEMBER_FIELDS}
      title={field.label}
      keyboardShouldPersistTaps="handled"
      headerAction={
        canManage ? (
          <HeaderButton
            label={`More for ${field.label}`}
            onPress={() =>
              openItemMenu({
                title: field.label,
                actions: [
                  {
                    key: "delete",
                    label: MEMBER_FIELDS_COPY.deleteField,
                    destructive: true,
                    run: () => void deleteField(),
                  },
                ],
              })
            }
          >
            <MoreGlyph color={tokens.color.text.foreground} />
          </HeaderButton>
        ) : undefined
      }
    >
      <SavedTextField
        label={MEMBER_FIELDS_COPY.name}
        value={field.label}
        editable={canManage}
        failure={failure}
        maxLength={MEMBER_FIELD_LABEL_MAX_LENGTH}
        onSave={(label) => save({ label })}
      />
      <FieldRows
        type={field.type}
        typeEditable={false}
        choices={field.options?.choices ?? []}
        visibility={field.visibility}
        required={field.required}
        sensitive={field.sensitive}
        editable={canManage}
        onType={() => undefined}
        onChoices={async (choices) => {
          let message: string | null = null;
          await save({ options: withChoices(field.options, choices) }, (m) => {
            message = m;
          });
          return message;
        }}
        onVisibility={(visibility) => void save({ visibility })}
        onRequired={(required) => void save({ required })}
        onSensitive={(sensitive) => void save({ sensitive })}
        maxLengthField={
          <SavedTextField
            label={MEMBER_FIELDS_COPY.maxLength}
            value={typeof maxLength === "number" ? String(maxLength) : ""}
            placeholder={MEMBER_FIELDS_COPY.noLimit}
            keyboardType="number-pad"
            allowBlank
            editable={canManage}
            failure={maxLengthFailure}
            onSave={async (typed) => {
              const parsed = parseMaxLength(typed);
              if (parsed === undefined) {
                setMaxLengthFailure(MAX_LENGTH_INVALID);
                return false;
              }
              setMaxLengthFailure(null);
              return save(
                { options: withMaxLength(field.options, parsed) },
                setMaxLengthFailure,
              );
            }}
          />
        }
      />
      {failure ? (
        <Text accessibilityLiveRegion="polite" style={styles.failure}>
          {failure}
        </Text>
      ) : null}
    </ScreenShell>
  );
}

function NewField({
  fields,
  canManage,
}: {
  /** The chapter's fields, for the new one's key and place; `null` unread. */
  fields: readonly ChapterCustomField[] | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens);
  const create = useCreateCustomField();
  const draftName = canManage ? NEW_FIELD_DRAFT : null;
  const opening = useKeptSheetOpening<NewFieldDraft>(draftName);
  const [draft, setDraft] = useState<NewFieldDraft>(
    () => opening ?? EMPTY_FIELD_DRAFT,
  );
  const kept = useKeptSheetDraft<NewFieldDraft>(
    draftName,
    draft,
    undefined,
    opening,
  );
  const [failure, setFailure] = useState<string | null>(null);
  const blocker = newFieldBlocker(draft);
  const edit = (patch: Partial<NewFieldDraft>) => {
    setFailure(null);
    setDraft((previous) => ({ ...previous, ...patch }));
  };

  async function add() {
    if (blocker || !fields || create.isPending) return;
    setFailure(null);
    kept.hold();
    try {
      await create.mutateAsync(createFieldBody(draft, fields));
      kept.clear();
      router.back();
    } catch (error) {
      kept.release();
      setFailure(
        `Couldn't add ${draft.label.trim()}. ${errorCopy(error, "Check that no other field has this name, then try again.", { serverWritesForMembers: true })}`,
      );
    }
  }

  return (
    <>
      <ScreenShell
        back={BACK_TO_MEMBER_FIELDS}
        title={MEMBER_FIELDS_COPY.addField}
        keyboardShouldPersistTaps="handled"
      >
        <FormFields>
          <ChapterTextField
            label={MEMBER_FIELDS_COPY.name}
            value={draft.label}
            onChangeText={(label) => edit({ label })}
            editable={canManage}
            placeholder="Shirt size"
            maxLength={MEMBER_FIELD_LABEL_MAX_LENGTH}
          />
        </FormFields>
        <FieldRows
          type={draft.type}
          typeEditable
          choices={draft.choices}
          visibility={draft.visibility}
          required={draft.required}
          sensitive={draft.sensitive}
          editable={canManage}
          onType={(type) => edit({ type })}
          onChoices={async (choices) => {
            edit({ choices });
            return null;
          }}
          onVisibility={(visibility) => edit({ visibility })}
          onRequired={(required) => edit({ required })}
          onSensitive={(sensitive) => edit({ sensitive })}
          maxLengthField={
            <FormFields>
              <ChapterTextField
                label={MEMBER_FIELDS_COPY.maxLength}
                value={draft.maxLength}
                onChangeText={(maxLength) => edit({ maxLength })}
                editable={canManage}
                placeholder={MEMBER_FIELDS_COPY.noLimit}
                keyboardType="number-pad"
                maxLength={6}
              />
            </FormFields>
          }
        />
        {failure ? (
          <Text accessibilityLiveRegion="polite" style={styles.failure}>
            {failure}
          </Text>
        ) : null}
        {canManage ? <TaskActionBarSpacer /> : null}
      </ScreenShell>
      {canManage ? (
        <TaskActionBar>
          <TaskBarPill
            label={blocker ?? MEMBER_FIELDS_COPY.createField}
            glyph={blocker ? undefined : (ink) => <CheckGlyph color={ink} />}
            fill={accent}
            ink={tokens.color.gold.onHouse}
            disabled={blocker !== null || !fields}
            busy={create.isPending}
            onPress={() => void add()}
          />
        </TaskActionBar>
      ) : null}
    </>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    failure: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructiveText,
      paddingHorizontal: tokens.spacing.xs,
    },
  });
}
