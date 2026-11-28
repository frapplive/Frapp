import { useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  addRow,
  classAssignments,
  useAssignPledgeClasses,
  useDeletePledgeClass,
  useMembers,
  usePermissionList,
  usePledgeClasses,
  useRenamePledgeClass,
  useReorderPledgeClasses,
  type ClassEditorRow,
  type MemberProfile,
  type PledgeClass,
} from "@repo/hooks";
import { describeLoadFailure, errorCopy } from "@repo/hooks/error-copy";
import {
  can,
  deletePledgeClassConfirm,
  memberCountLabel,
  moveId,
  PEOPLE_SETTINGS_COPY,
  PLEDGE_CLASS_ASSIGNMENTS_MAX,
  PLEDGE_CLASS_NAME_MAX_LENGTH,
  PLEDGE_CLASS_SETTINGS_COPY,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { ScreenShell } from "@/components/screen-shell";
import { HeaderButton } from "@/components/header-button";
import { CloseGlyph, MoreGlyph, PlusGlyph } from "@/components/control-glyphs";
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
import { SavedTextField } from "@/components/settings/saved-text-field";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { usePledgeClassTerms } from "@/lib/directory/pledge-class";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import {
  addableClassMembers,
  classMemberName,
  classRowsOf,
  moveClassRow,
  movesFromLabel,
} from "@repo/hooks";
import { typeRole, useFrappTheme } from "@/lib/theme";

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * One pledge class on the phone (#6029), pushed from Chapter settings →
 * Pledge class, with web's parts in web's order: the name on top, saved on
 * its own; the ⋯ in the header for Move up, Move down and Delete; then the
 * members, oldest number first.
 *
 * Members are an editor, as on web: "Add a member" opens the roster (members
 * in no class first, then the others, "Moves from Alpha"), each row's number
 * follows its place (`renumberRows`), and a row's long press moves it or
 * takes it out, as its X does. Each add, removal and move saves on its own
 * at once (rulebook § 9, #6033), as on web: it sends only the members it
 * changes, in one request the API applies whole or not at all
 * (`classAssignments`), then reads the roster again. A refused change puts
 * the rows back and is said under the members (the phone has no toast).
 *
 * Every write needs `roles:manage`; the list opens this page only for it.
 */
export default function PledgeClassScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const classId = firstParam(params.id);
  const { classTerm } = usePledgeClassTerms();
  const permissions = usePermissionList();
  const canManage = can("roles:manage", permissions);
  const classesQuery = usePledgeClasses();
  const membersQuery = useMembers();
  const back = { label: classTerm, href: "/pledge-classes" as const };
  const classes = classesQuery.data;
  const entry = classes?.find((item) => item.id === classId) ?? null;

  const classesFailed = classesQuery.isError && classes === undefined;
  if (
    classesFailed ||
    (membersQuery.isError && membersQuery.data === undefined)
  ) {
    return (
      <ScreenShell back={back} title={classTerm}>
        <ErrorState
          // Web's words for whichever read failed.
          title={
            classesFailed
              ? PLEDGE_CLASS_SETTINGS_COPY.loadFailed
              : PLEDGE_CLASS_SETTINGS_COPY.membersLoadFailed
          }
          body={describeLoadFailure(classesQuery.error ?? membersQuery.error)}
          onRetry={() => {
            void classesQuery.refetch();
            void membersQuery.refetch();
          }}
          isRetrying={classesQuery.isFetching || membersQuery.isFetching}
        />
      </ScreenShell>
    );
  }
  if (!classes || !membersQuery.data) {
    return (
      <ScreenShell back={back} title={classTerm}>
        <PledgeClassSkeleton />
      </ScreenShell>
    );
  }
  if (!entry) {
    return (
      <ScreenShell back={back} title={classTerm}>
        <ErrorState
          title={PLEDGE_CLASS_SETTINGS_COPY.gone}
          body={PLEDGE_CLASS_SETTINGS_COPY.goneDetail}
        />
      </ScreenShell>
    );
  }
  return (
    <ClassPage
      // Keyed by class, so its rows never carry over to the next one.
      key={entry.id}
      entry={entry}
      classes={classes}
      liveMembers={membersQuery.data}
      refetchMembers={async () => (await membersQuery.refetch()).data}
      canManage={canManage}
      back={back}
    />
  );
}

function PledgeClassSkeleton() {
  const { tokens } = useFrappTheme();
  return (
    <SkeletonRegion label="Loading members" style={{ gap: tokens.spacing.lg }}>
      <ListSection>
        {[0, 1, 2, 3, 4].map((index) => (
          <ListRowSkeleton key={index} index={index} />
        ))}
      </ListSection>
    </SkeletonRegion>
  );
}

function ClassPage({
  entry,
  classes,
  liveMembers,
  refetchMembers,
  canManage,
  back,
}: {
  entry: PledgeClass;
  classes: readonly PledgeClass[];
  liveMembers: readonly MemberProfile[];
  refetchMembers: () => Promise<readonly MemberProfile[] | undefined>;
  canManage: boolean;
  back: { label: string; href: "/pledge-classes" };
}) {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const rename = useRenamePledgeClass();
  const reorder = useReorderPledgeClasses();
  const remove = useDeletePledgeClass();
  const assign = useAssignPledgeClasses();
  const itemMenu = useItemMenu();
  const addRef = useRef<BottomSheetModal>(null);
  // The roster as last read. The rows are built from it, so each change is
  // worked out against the same snapshot: a member another officer adds
  // meanwhile must not read as "taken out" (`classAssignments`). Every save
  // reads it again.
  const [members, setMembers] = useState(liveMembers);
  const [rows, setRows] = useState<ClassEditorRow[]>(() =>
    classRowsOf(liveMembers, entry.id, classes),
  );
  // A failed rename is the name field's own line; a failed Move, Delete or
  // member change is the page's one line, under the members, said once.
  const [renameFailure, setRenameFailure] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const index = classes.findIndex((item) => item.id === entry.id);
  const classNames = useMemo(
    () => new Map(classes.map((item) => [item.id, item.name])),
    [classes],
  );
  const addable = useMemo(
    () =>
      addableClassMembers(
        members,
        new Set(rows.map((row) => row.memberId)),
        classNames,
      ),
    [members, rows, classNames],
  );
  // Held through the roster's re-read too, so the next change is never
  // worked out against the snapshot the last one changed.
  const [saving, setSaving] = useState(false);
  const busy = saving;

  async function run(
    action: () => Promise<unknown>,
    fallback: string,
    onFail: (message: string | null) => void = setFailure,
  ) {
    onFail(null);
    try {
      await action();
      return true;
    } catch (error) {
      onFail(
        `Couldn't change ${entry.name}. ${errorCopy(error, fallback, { serverWritesForMembers: true })}`,
      );
      return false;
    }
  }

  function moveClass(by: -1 | 1) {
    const ids = moveId(
      classes.map((item) => item.id),
      entry.id,
      by,
    );
    if (!ids) return;
    void run(
      () => reorder.mutateAsync(ids),
      "The list changed while you were editing. It has been reloaded.",
    );
  }

  async function deleteClass() {
    const confirm = deletePledgeClassConfirm(
      entry.name,
      liveMembers.filter((member) => member.pledge_class_id === entry.id)
        .length,
    );
    const ok = await confirmAlert({
      title: confirm.title,
      body: confirm.body,
      confirmLabel: confirm.action,
      destructive: true,
    });
    if (!ok) return;
    if (
      await run(() => remove.mutateAsync(entry.id), "Try again in a moment.")
    ) {
      router.back();
    }
  }

  /**
   * Each add, removal and move saves at once (#6033), the way Discord's role
   * members do: only the members it changes are sent, then the roster is
   * read again, so the next change is worked out against it. A refused
   * change puts the rows back as they were.
   */
  async function commit(next: ClassEditorRow[]) {
    const changes = classAssignments(entry.id, next, members);
    if (changes === null) return;
    setFailure(null);
    if (changes.length === 0) {
      setRows(next);
      return;
    }
    // The batch cap stays as a guard; one change never comes near it.
    if (changes.length > PLEDGE_CLASS_ASSIGNMENTS_MAX) {
      setFailure(
        `Couldn't save ${entry.name}. ${PLEDGE_CLASS_SETTINGS_COPY.tooManyAtOnce(PLEDGE_CLASS_ASSIGNMENTS_MAX)}`,
      );
      return;
    }
    const before = rows;
    setRows(next);
    setSaving(true);
    let ok = true;
    try {
      await assign.mutateAsync(changes);
    } catch (error) {
      ok = false;
      setFailure(
        `Couldn't save ${entry.name}. ${errorCopy(error, PLEDGE_CLASS_SETTINGS_COPY.saveFallback, { serverWritesForMembers: true })}`,
      );
    }
    const fresh = await refetchMembers();
    if (fresh) {
      setMembers(fresh);
      setRows(classRowsOf(fresh, entry.id, classes));
    } else if (!ok) {
      setRows(before);
    }
    setSaving(false);
  }

  function takeOut(row: ClassEditorRow) {
    void commit(rows.filter((item) => item.memberId !== row.memberId));
  }

  function rowMenu(row: ClassEditorRow, at: number) {
    if (!canManage || busy) return null;
    const step = (by: -1 | 1) => () => {
      const moved = moveClassRow(rows, row.memberId, by);
      if (moved) void commit(moved);
    };
    const actions: ItemMenuAction[] = [
      ...(at > 0
        ? [{ key: "up", label: PEOPLE_SETTINGS_COPY.moveUp, run: step(-1) }]
        : []),
      ...(at < rows.length - 1
        ? [{ key: "down", label: PEOPLE_SETTINGS_COPY.moveDown, run: step(1) }]
        : []),
      {
        key: "remove",
        label: "Remove",
        destructive: true,
        run: () => takeOut(row),
      },
    ];
    return itemMenu.handleFor({ title: row.name, actions });
  }

  const headerActions: ItemMenuAction[] = [
    ...(index > 0
      ? [
          {
            key: "up",
            label: PEOPLE_SETTINGS_COPY.moveUp,
            run: () => moveClass(-1),
          },
        ]
      : []),
    ...(index >= 0 && index < classes.length - 1
      ? [
          {
            key: "down",
            label: PEOPLE_SETTINGS_COPY.moveDown,
            run: () => moveClass(1),
          },
        ]
      : []),
    {
      key: "delete",
      label: `Delete ${entry.name}`,
      destructive: true,
      run: () => void deleteClass(),
    },
  ];

  return (
    <ScreenShell
      back={back}
      title={entry.name}
      headerAction={
        canManage ? (
          <HeaderButton
            label={`More for ${entry.name}`}
            onPress={() =>
              openItemMenu({ title: entry.name, actions: headerActions })
            }
          >
            <MoreGlyph color={tokens.color.text.foreground} />
          </HeaderButton>
        ) : undefined
      }
    >
      <SavedTextField
        label={PEOPLE_SETTINGS_COPY.name}
        value={entry.name}
        editable={canManage}
        failure={renameFailure}
        maxLength={PLEDGE_CLASS_NAME_MAX_LENGTH}
        onSave={(name) =>
          run(
            () => rename.mutateAsync({ id: entry.id, name }),
            "Check that no other one has this name, then try again.",
            setRenameFailure,
          )
        }
      />

      <SectionHeader count={memberCountLabel(rows.length)}>
        {PLEDGE_CLASS_SETTINGS_COPY.members}
      </SectionHeader>
      <ListSection>
        {canManage ? (
          <ListRow
            label={PLEDGE_CLASS_SETTINGS_COPY.addMember}
            leading={<PlusGlyph color={tokens.color.text.mutedForeground} />}
            action
            disabled={busy || addable.length === 0}
            description={
              addable.length === 0
                ? PLEDGE_CLASS_SETTINGS_COPY.everyoneIn
                : null
            }
            accessibilityHint="Opens the chapter's members."
            onPress={() => addRef.current?.present()}
          />
        ) : null}
        {rows.length === 0 ? (
          <ListRow
            label={PLEDGE_CLASS_SETTINGS_COPY.nobodyYet}
            variant="detail"
          />
        ) : (
          rows.map((row, at) => {
            const menu = rowMenu(row, at);
            return (
              <ListRow
                key={row.memberId}
                label={row.name}
                // The number follows the row's place, not a field.
                leading={
                  <View style={styles.numberSlot}>
                    <Text style={styles.number}>{row.number}</Text>
                  </View>
                }
                onLongPress={longPressOf(menu)}
                {...itemMenuAccessibility(menu)}
                trailing={
                  canManage ? (
                    <IconButton
                      label={`Remove ${row.name} from ${entry.name}`}
                      disabled={busy}
                      onPress={() => takeOut(row)}
                    >
                      <CloseGlyph color={tokens.color.text.mutedForeground} />
                    </IconButton>
                  ) : undefined
                }
              />
            );
          })
        )}
      </ListSection>
      {failure ? (
        <Text accessibilityLiveRegion="polite" style={styles.failure}>
          {failure}
        </Text>
      ) : null}
      {itemMenu.element}
      {canManage ? (
        <OptionSheet
          ref={addRef}
          title={PLEDGE_CLASS_SETTINGS_COPY.addMember}
          searchPlaceholder="Find a member"
          options={addable.map((candidate) => ({
            value: candidate.member.id,
            label: candidate.name,
            detail: candidate.movesFrom
              ? movesFromLabel(candidate.movesFrom)
              : undefined,
          }))}
          selected={null}
          onSelect={(memberId) => {
            const picked = members.find((member) => member.id === memberId);
            if (!picked) return;
            void commit(
              addRow(rows, {
                memberId: picked.id,
                name: classMemberName(picked),
              }),
            );
          }}
        />
      ) : null}
    </ScreenShell>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    numberSlot: {
      minWidth: tokens.spacing.xl,
      alignItems: "flex-end",
    },
    number: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.mutedForeground,
      fontVariant: ["tabular-nums"],
    },
    failure: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructiveText,
      paddingHorizontal: tokens.spacing.xs,
    },
  });
}
