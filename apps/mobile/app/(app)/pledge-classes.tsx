import { useMemo, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  useCreatePledgeClass,
  useDeletePledgeClass,
  useMembers,
  usePermissionList,
  usePledgeClasses,
  useReorderPledgeClasses,
  type PledgeClass,
} from "@repo/hooks";
import { describeLoadFailure, errorCopy } from "@repo/hooks/error-copy";
import {
  addPledgeClassLabel,
  can,
  deletePledgeClassConfirm,
  memberCountLabel,
  moveId,
  PEOPLE_SETTINGS_COPY,
  PLEDGE_CLASS_NAME_MAX_LENGTH,
  PLEDGE_CLASS_SETTINGS_COPY,
  PLEDGE_CLASSES_MAX,
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
import {
  itemMenuAccessibility,
  longPressOf,
  useItemMenu,
  type ItemMenuAction,
} from "@/components/item-actions-menu";
import { NameSheet } from "@/components/roles/name-sheet";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { usePledgeClassTerms } from "@/lib/directory/pledge-class";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import { classMemberCounts } from "@/lib/settings/pledge-classes";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * Chapter settings → Pledge class on the phone (#6029; Paul's 2026-11-25
 * call, parity with web's page): the chapter's classes, oldest first, titled
 * with the chapter's own word for one (`vocab("class")`, drawn as typed).
 *
 * One group: a row per class with its member count, opening its page
 * (`pledge-class.tsx`: name, members, order); a long press for Move up, Move
 * down and Delete, red and last, confirmed. Move up and down stand in for
 * web's drag (Paul, 2026-11-25: the phone has no shared drag list yet). The
 * last row adds one at the end, as the newest, through the name sheet Roles
 * and groups' Add tier uses.
 *
 * Reads need `members:view`; every write needs `roles:manage`, as on web. A
 * viewer without it reads the list, with no add, no menu and no way into a
 * class's editor, and the footnote says who can change it.
 */
export default function PledgeClassesScreen() {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const { classTerm } = usePledgeClassTerms();
  const permissions = usePermissionList();
  const canManage = can("roles:manage", permissions);
  const classesQuery = usePledgeClasses();
  const membersQuery = useMembers();
  const reorder = useReorderPledgeClasses();
  const remove = useDeletePledgeClass();
  const create = useCreatePledgeClass();
  const itemMenu = useItemMenu();
  const addRef = useRef<BottomSheetModal>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const classes = useMemo(() => classesQuery.data ?? [], [classesQuery.data]);
  const members = membersQuery.data;
  const counts = useMemo(
    () => (members ? classMemberCounts(members) : null),
    [members],
  );
  const countOf = (id: string) => (counts ? (counts.get(id) ?? 0) : null);

  async function move(entry: PledgeClass, by: -1 | 1) {
    const ids = moveId(
      classes.map((item) => item.id),
      entry.id,
      by,
    );
    if (!ids) return;
    setFailure(null);
    try {
      // Settles after the list is re-read (`useReorderPledgeClasses`).
      await reorder.mutateAsync(ids);
    } catch (error) {
      setFailure(
        `Couldn't save the order. ${errorCopy(error, "The list changed while you were editing. It has been reloaded.", { serverWritesForMembers: true })}`,
      );
    }
  }

  async function handleDelete(entry: PledgeClass) {
    const confirm = deletePledgeClassConfirm(entry.name, countOf(entry.id));
    const ok = await confirmAlert({
      title: confirm.title,
      body: confirm.body,
      confirmLabel: confirm.action,
      destructive: true,
    });
    if (!ok) return;
    setFailure(null);
    try {
      await remove.mutateAsync(entry.id);
    } catch (error) {
      setFailure(
        `Couldn't delete ${entry.name}. ${errorCopy(error, "Try again in a moment.", { serverWritesForMembers: true })}`,
      );
    }
  }

  function menuFor(entry: PledgeClass, index: number) {
    if (!canManage) return null;
    const actions: ItemMenuAction[] = [
      ...(index > 0
        ? [
            {
              key: "up",
              label: PEOPLE_SETTINGS_COPY.moveUp,
              run: () => void move(entry, -1),
            },
          ]
        : []),
      ...(index < classes.length - 1
        ? [
            {
              key: "down",
              label: PEOPLE_SETTINGS_COPY.moveDown,
              run: () => void move(entry, 1),
            },
          ]
        : []),
      {
        key: "delete",
        label: `Delete ${entry.name}`,
        destructive: true,
        run: () => void handleDelete(entry),
      },
    ];
    return itemMenu.handleFor({ title: entry.name, actions });
  }

  let body: React.ReactNode;
  if (classesQuery.isError && classesQuery.data === undefined) {
    body = (
      <ErrorState
        title="Couldn't load the list"
        body={describeLoadFailure(classesQuery.error)}
        onRetry={() => void classesQuery.refetch()}
        isRetrying={classesQuery.isFetching}
      />
    );
  } else if (!classesQuery.isSuccess) {
    body = (
      <SkeletonRegion label={`Loading ${classTerm}`} style={styles.skeleton}>
        <ListSection>
          {[0, 1, 2, 3].map((index) => (
            <ListRowSkeleton key={index} index={index} />
          ))}
        </ListSection>
      </SkeletonRegion>
    );
  } else {
    const full = classes.length >= PLEDGE_CLASSES_MAX;
    body = (
      <>
        <ListSection
          footnote={
            canManage
              ? PLEDGE_CLASS_SETTINGS_COPY.footnote
              : `${PLEDGE_CLASS_SETTINGS_COPY.footnote} ${PLEDGE_CLASS_SETTINGS_COPY.readOnly}`
          }
        >
          {classes.length === 0 ? (
            <ListRow
              label={PLEDGE_CLASS_SETTINGS_COPY.empty}
              variant="detail"
            />
          ) : null}
          {classes.map((entry, index) => {
            const count = countOf(entry.id);
            const menu = menuFor(entry, index);
            return (
              <ListRow
                key={entry.id}
                label={entry.name}
                value={count === null ? null : memberCountLabel(count)}
                // The editor is built from the roster, so it waits for it.
                onPress={
                  canManage && members
                    ? () =>
                        router.push({
                          pathname: "/pledge-class",
                          params: { id: entry.id },
                        })
                    : undefined
                }
                accessibilityHint={
                  canManage ? "Opens its name and members." : undefined
                }
                onLongPress={longPressOf(menu)}
                {...itemMenuAccessibility(menu)}
              />
            );
          })}
          {canManage ? (
            <ListRow
              label={addPledgeClassLabel(classTerm)}
              leading={<PlusGlyph color={tokens.color.text.mutedForeground} />}
              action
              disabled={full}
              description={
                full
                  ? `This chapter has ${PLEDGE_CLASSES_MAX}, the most it can hold.`
                  : null
              }
              accessibilityHint="Names one, added at the end as the newest."
              onPress={() => addRef.current?.present()}
            />
          ) : null}
        </ListSection>
        {membersQuery.isError && !members ? (
          <Text style={styles.note}>
            {
              "Couldn't load the chapter's members, so counts and the member editor are unavailable. Pull to retry."
            }
          </Text>
        ) : null}
        {failure ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.note, styles.failure]}
          >
            {failure}
          </Text>
        ) : null}
      </>
    );
  }

  return (
    <ScreenShell
      back={BACK_TO_CHAPTER_SETTINGS}
      title={classTerm}
      refresh={() =>
        Promise.all([classesQuery.refetch(), membersQuery.refetch()])
      }
    >
      {body}
      {itemMenu.element}
      {canManage ? (
        <NameSheet
          ref={addRef}
          title={addPledgeClassLabel(classTerm)}
          submitLabel={addPledgeClassLabel(classTerm)}
          placeholder="Alpha, or Fall 2026"
          fieldLabel={PEOPLE_SETTINGS_COPY.name}
          maxLength={PLEDGE_CLASS_NAME_MAX_LENGTH}
          onSubmit={async (name) => {
            try {
              await create.mutateAsync(name);
              return null;
            } catch (error) {
              return `Couldn't add ${name}. ${errorCopy(error, "Check that no other one has this name, then try again.", { serverWritesForMembers: true })}`;
            }
          }}
        />
      ) : null}
    </ScreenShell>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    skeleton: { gap: tokens.spacing.lg },
    note: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
      paddingHorizontal: tokens.spacing.xs,
    },
    failure: { color: tokens.color.semantic.destructiveText },
  });
}
