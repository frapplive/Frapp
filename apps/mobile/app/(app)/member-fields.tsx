import { useState, type ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import {
  useCustomFields,
  useDeleteCustomField,
  usePermissionList,
  useUpdateCustomField,
} from "@repo/hooks";
import { describeLoadFailure, errorCopy } from "@repo/hooks/error-copy";
import {
  can,
  deleteMemberFieldConfirm,
  MEMBER_FIELD_VISIBILITY_LABEL,
  MEMBER_FIELDS_COPY,
  memberFieldFacts,
  PEOPLE_SETTINGS_COPY,
  type ChapterCustomField,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { ScreenShell } from "@/components/screen-shell";
import { BACK_TO_CHAPTER_SETTINGS } from "@/components/back-row";
import {
  ListRow,
  ListRowSkeleton,
  ListSection,
} from "@/components/list-section";
import { PlusGlyph } from "@/components/control-glyphs";
import { FieldTypeGlyph } from "@/components/settings/field-type-glyph";
import {
  itemMenuAccessibility,
  longPressOf,
  useItemMenu,
  type ItemMenuAction,
} from "@/components/item-actions-menu";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import { moveFieldPatches } from "@/lib/settings/member-fields";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * Chapter settings → Member fields on the phone (#6029; Paul's 2026-11-25
 * call, parity with web's page): the questions members answer under More
 * details, in the order their profiles list them.
 *
 * One group: a row per field, its type's glyph, its name, a muted line of
 * its type and flags (`memberFieldFacts`) and who can see it; each opens its
 * page (`member-field.tsx`). A long press offers Move up, Move down (written
 * as `memberFieldSortPatches`, one save per field that moves) and Delete,
 * red, last and confirmed. "Add a field" opens a new field's page.
 *
 * Reads need `chapter-config:view`, writes `chapter-config:manage`, as on
 * web; a viewer without the second reads every field on its page, unchanged.
 */
export default function MemberFieldsScreen() {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const glyphColor = tokens.color.text.mutedForeground;
  const permissions = usePermissionList();
  const canManage = can("chapter-config:manage", permissions);
  const fieldsQuery = useCustomFields();
  const update = useUpdateCustomField();
  const remove = useDeleteCustomField();
  const itemMenu = useItemMenu();
  const [failure, setFailure] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const fields = fieldsQuery.data ?? [];

  async function move(field: ChapterCustomField, by: -1 | 1) {
    const patches = moveFieldPatches(fields, field.id, by);
    if (patches.length === 0) return;
    setFailure(null);
    setMoving(true);
    try {
      // One at a time, in order, so the list never reads two fields at once
      // in a place neither asked for.
      for (const patch of patches) {
        await update.mutateAsync({ id: patch.id, body: { sort: patch.sort } });
      }
    } catch (error) {
      setFailure(
        `Couldn't save the order. ${errorCopy(error, "Try again in a moment.", { serverWritesForMembers: true })}`,
      );
    } finally {
      setMoving(false);
    }
  }

  async function handleDelete(field: ChapterCustomField) {
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
    } catch (error) {
      setFailure(
        `Couldn't delete ${field.label}. ${errorCopy(error, "Try again in a moment.", { serverWritesForMembers: true })}`,
      );
    }
  }

  function menuFor(field: ChapterCustomField, index: number) {
    if (!canManage || moving) return null;
    const actions: ItemMenuAction[] = [
      ...(index > 0
        ? [
            {
              key: "up",
              label: PEOPLE_SETTINGS_COPY.moveUp,
              run: () => void move(field, -1),
            },
          ]
        : []),
      ...(index < fields.length - 1
        ? [
            {
              key: "down",
              label: PEOPLE_SETTINGS_COPY.moveDown,
              run: () => void move(field, 1),
            },
          ]
        : []),
      {
        key: "delete",
        label: MEMBER_FIELDS_COPY.deleteField,
        destructive: true,
        run: () => void handleDelete(field),
      },
    ];
    return itemMenu.handleFor({ title: field.label, actions });
  }

  let body: ReactNode;
  if (fieldsQuery.isError && fieldsQuery.data === undefined) {
    body = (
      <ErrorState
        title="Couldn't load the fields"
        body={describeLoadFailure(fieldsQuery.error)}
        onRetry={() => void fieldsQuery.refetch()}
        isRetrying={fieldsQuery.isFetching}
      />
    );
  } else if (!fieldsQuery.isSuccess) {
    body = (
      <SkeletonRegion label="Loading member fields" style={styles.skeleton}>
        <ListSection>
          {[0, 1, 2, 3].map((index) => (
            <ListRowSkeleton key={index} index={index} description />
          ))}
        </ListSection>
      </SkeletonRegion>
    );
  } else {
    body = (
      <>
        <ListSection footnote={MEMBER_FIELDS_COPY.footnote}>
          {fields.length === 0 ? (
            <ListRow label={MEMBER_FIELDS_COPY.empty} variant="detail" />
          ) : null}
          {fields.map((field, index) => {
            const menu = menuFor(field, index);
            return (
              <ListRow
                key={field.id}
                label={field.label}
                leading={
                  <FieldTypeGlyph type={field.type} color={glyphColor} />
                }
                description={memberFieldFacts(field)}
                value={MEMBER_FIELD_VISIBILITY_LABEL[field.visibility]}
                accessibilityHint="Opens its type, options and who can see it."
                onPress={() =>
                  router.push({
                    pathname: "/member-field",
                    params: { id: field.id },
                  })
                }
                onLongPress={longPressOf(menu)}
                {...itemMenuAccessibility(menu)}
              />
            );
          })}
          {canManage ? (
            <ListRow
              label={MEMBER_FIELDS_COPY.addField}
              leading={<PlusGlyph color={glyphColor} />}
              accessibilityHint="Opens a new field's name, type and options."
              onPress={() =>
                router.push({
                  pathname: "/member-field",
                  params: { new: "1" },
                })
              }
            />
          ) : null}
        </ListSection>
        {failure ? (
          <Text accessibilityLiveRegion="polite" style={styles.failure}>
            {failure}
          </Text>
        ) : null}
      </>
    );
  }

  return (
    <ScreenShell
      back={BACK_TO_CHAPTER_SETTINGS}
      title={MEMBER_FIELDS_COPY.pageTitle}
      refresh={() => fieldsQuery.refetch()}
    >
      {body}
      {itemMenu.element}
    </ScreenShell>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    skeleton: { gap: tokens.spacing.lg },
    failure: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructiveText,
      paddingHorizontal: tokens.spacing.xs,
    },
  });
}
