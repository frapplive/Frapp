"use client";

import { closeToAddress, pushAddressTo } from "@/lib/address/address";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, X } from "lucide-react";
import {
  addableClassMembers,
  addRow,
  classAssignments,
  classMemberCounts,
  classRowsOf,
  movesFromLabel,
  type AddableMember,
  renumberRows,
  useAssignPledgeClasses,
  useCreatePledgeClass,
  useDeletePledgeClass,
  useMembers,
  usePledgeClasses,
  useRenamePledgeClass,
  useReorderPledgeClasses,
  type ClassEditorRow,
  type MemberProfile,
  type PledgeClass,
} from "@repo/hooks";
import {
  readKeptDraft,
  useKeptDraftKeys,
  useKeptFormDraft,
} from "@repo/hooks/kept-drafts";
import {
  addPledgeClassLabel,
  deletePledgeClassConfirm,
  memberCountLabel,
  moveId,
  PEOPLE_SETTINGS_COPY,
  PLEDGE_CLASS_ASSIGNMENTS_MAX,
  PLEDGE_CLASS_NAME_MAX_LENGTH,
  PLEDGE_CLASS_SETTINGS_COPY,
  PLEDGE_CLASSES_MAX,
} from "@repo/validation";
import { KeptDraftNote } from "@/components/shared/kept-draft-note";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  ErrorState,
  OfflineState,
  anyReadUncached,
  pausedRead,
} from "@/components/shared/async-states";
import {
  confirmWords,
  useConfirmDialog,
} from "@/components/shared/confirm-dialog";
import { InlineNote, InlineNoteAction } from "@/components/shared/inline-note";
import { MemberSearchField } from "@/components/shared/member-search-field";
import { ReorderList } from "@/components/shared/reorder-list";
import {
  ActionMenuButton,
  type RowMenuEntry,
} from "@/components/shared/row-menu";
import { SettingsAddRow } from "@/components/shared/settings-add-row";
import {
  SettingsGroup,
  SettingsReorderRow,
} from "@/components/shared/settings-row";
import { SectionLabel } from "@/components/shared/section-label";
import { SettingsListCardSkeleton } from "@/components/settings/settings-skeleton";
import { SettingsNameField } from "@/components/settings/settings-name-field";
import { SettingsSubpage } from "@/components/settings/settings-subpage";
import { useToast } from "@/lib/hooks/use-toast";
import { useToastedRun } from "@/lib/hooks/use-toasted-run";
import { useNetwork } from "@/lib/providers/network-provider";
import { getErrorMessage } from "@/lib/utils";

type Props = {
  /** Whether the viewer holds `roles:manage`, the gate on every write here. */
  canManage: boolean;
  /** The chapter's word for a class: "Pledge class", "Line", "Cohort". */
  classTerm: string;
  /** The chapter's word for a member's number: "Fraternal order", "Roll number". */
  orderTerm: string;
};

const BASE = "/settings?tab=classes";

function classHref(id: string): string {
  return `${BASE}&class=${encodeURIComponent(id)}`;
}

/** One class's kept member draft (`@repo/hooks/kept-drafts`, #4593). */
function classDraftName(classId: string): string {
  return `pledge-class:${classId}`;
}

/** What the member editor keeps: the rows, and the roster they were read from. */
type ClassDraft = {
  members: readonly MemberProfile[];
  rows: ClassEditorRow[];
};

/**
 * Settings → the chapter's pledge classes (#3939; in the settings shape since
 * #6029, Paul's Discord channel-settings ruling): one group of rows, oldest
 * first, each a drag grip, the class's name, its member count and a chevron
 * to its page. "Add pledge class" is the last row. Behaviour:
 * `spec/behavior/members.md` § Pledge class and order number.
 *
 * | URL | Page |
 * | --- | ---- |
 * | `?tab=classes` | The list |
 * | `?tab=classes&class=<id>` | A class: its name, its members in order, ⋯ with Move and Delete (`ClassPage`) |
 *
 * The phone draws the same list and page (`apps/mobile/app/(app)/pledge-classes.tsx`)
 * in the same words (`PLEDGE_CLASS_SETTINGS_COPY`), ordering by Move up and
 * Move down in the long-press menu until it has a drag list.
 *
 * Reads need `members:view`; every write needs `roles:manage`, which is also
 * what shows the tab (`settings-access.ts`).
 *
 * **Copy never inflects the chapter's words.** `classTerm` and `orderTerm` are
 * whatever the chapter typed in Settings → vocabulary, so they are drawn as
 * typed, in a heading or a label, and sentences say "it" or "the list".
 */
export function SettingsClassesTab({ canManage, classTerm, orderTerm }: Props) {
  const searchParams = useSearchParams();
  const classId = searchParams.get("class");
  const classesQuery = usePledgeClasses();
  const membersQuery = useMembers();
  const reorder = useReorderPledgeClasses();
  const create = useCreatePledgeClass();
  const remove = useDeletePledgeClass();
  const run = useToastedRun();
  const { isOffline } = useNetwork();
  const { toast } = useToast();
  // Above the loading and error branches, so a failed background refetch does
  // not unmount an open delete confirmation (see `SettingsFieldsTab`).
  const { confirm, confirmDialog } = useConfirmDialog();
  // The order as the officer just dropped it, shown until the save and the
  // re-read answer, so a row never jumps back and then forward again.
  const [pendingOrder, setPendingOrder] = useState<PledgeClass[] | null>(null);
  // The newest order not yet sent, and whether a save is running. Moves made
  // while one is in flight collapse into a single follow-up save, so the
  // handles stay usable and two saves never race each other.
  const wantedOrder = useRef<PledgeClass[] | null>(null);
  const savingOrder = useRef(false);

  const saved = classesQuery.data ?? [];
  const classes = pendingOrder ?? saved;
  // `undefined` until the roster read answers: a count, the delete warning
  // and the class editor all need the real roster, never an empty stand-in.
  const members = membersQuery.data;
  const countByClass = useMemo(
    () => classMemberCounts(members ?? []),
    [members],
  );
  const countOf = (id: string) =>
    members ? (countByClass.get(id) ?? 0) : null;

  async function handleReorder(next: PledgeClass[]) {
    setPendingOrder(next);
    wantedOrder.current = next;
    if (savingOrder.current) return;
    savingOrder.current = true;
    try {
      while (wantedOrder.current) {
        const ids = wantedOrder.current.map((entry) => entry.id);
        wantedOrder.current = null;
        // Settles after the list is re-read (`useReorderPledgeClasses`).
        await reorder.mutateAsync(ids);
      }
    } catch (error) {
      wantedOrder.current = null;
      toast({
        title: "Couldn't save the order",
        description: getErrorMessage(
          error,
          "The list changed while you were editing. It has been reloaded.",
        ),
        variant: "destructive",
      });
    } finally {
      savingOrder.current = false;
      // The saved list is in the cache by now, so the row neither jumps back
      // nor keeps an order the API refused.
      setPendingOrder(null);
    }
  }

  function move(entry: PledgeClass, by: -1 | 1) {
    const ids = moveId(
      classes.map((candidate) => candidate.id),
      entry.id,
      by,
    );
    if (!ids) return;
    const byId = new Map(classes.map((candidate) => [candidate.id, candidate]));
    void handleReorder(ids.map((id) => byId.get(id)!));
  }

  /** Delete, confirmed with how many members it leaves without one. */
  async function deleteClass(entry: PledgeClass): Promise<boolean> {
    const ok = await confirm({
      ...confirmWords(deletePledgeClassConfirm(entry.name, countOf(entry.id))),
      tone: "destructive",
    });
    if (!ok) return false;
    return run(
      () => remove.mutateAsync(entry.id),
      `Couldn't delete ${entry.name}`,
      "Retry in a moment.",
    );
  }

  const paused = pausedRead(classesQuery);

  let body: ReactNode;
  if (isOffline && anyReadUncached(classesQuery)) {
    body = (
      <OfflineState
        title="This list is unavailable offline"
        description="Reconnect to load it and make changes."
        onRetry={() => void classesQuery.refetch()}
      />
    );
  } else if (classesQuery.isLoading || paused) {
    body = <SettingsListCardSkeleton label={`Loading ${classTerm}`} />;
  } else if (classesQuery.isError && classesQuery.data === undefined) {
    body = (
      <ErrorState
        title={PLEDGE_CLASS_SETTINGS_COPY.loadFailed}
        description="Retry to fetch it again."
        onRetry={() => void classesQuery.refetch()}
      />
    );
  } else if (classId) {
    const entry = saved.find((candidate) => candidate.id === classId);
    body = entry ? (
      <ClassPage
        key={entry.id}
        pledgeClass={entry}
        classes={saved}
        members={members}
        membersFailed={membersQuery.isError && !members}
        onRetryMembers={() => void membersQuery.refetch()}
        refetchMembers={async () => (await membersQuery.refetch()).data}
        canManage={canManage}
        classTerm={classTerm}
        orderTerm={orderTerm}
        onMove={(by) => move(entry, by)}
        onDelete={async () => {
          if (await deleteClass(entry)) closeToAddress(BASE);
        }}
      />
    ) : (
      <SettingsSubpage backHref={BASE} backLabel={classTerm} title={classTerm}>
        <InlineNote>
          {PLEDGE_CLASS_SETTINGS_COPY.gone}{" "}
          {PLEDGE_CLASS_SETTINGS_COPY.goneDetail}
        </InlineNote>
      </SettingsSubpage>
    );
  } else {
    const full = classes.length >= PLEDGE_CLASSES_MAX;
    body = (
      <div className="space-y-4">
        <h2 className="text-title text-foreground">{classTerm}</h2>
        <SettingsGroup
          id="settings-classes"
          label={classTerm}
          footnote={
            classes.length > 1 ? PLEDGE_CLASS_SETTINGS_COPY.footnote : undefined
          }
        >
          {classes.length > 0 ? (
            <li>
              <ReorderList
                grouped
                aria-label={classTerm}
                items={classes}
                getId={(entry) => entry.id}
                getLabel={(entry) => entry.name}
                onReorder={(next) => void handleReorder(next)}
                disabled={!canManage}
                renderItem={(entry, index) => (
                  <SettingsReorderRow
                    href={classHref(entry.id)}
                    label={entry.name}
                    value={
                      countOf(entry.id) === null
                        ? null
                        : memberCountLabel(countOf(entry.id)!)
                    }
                    menu={
                      canManage
                        ? {
                            label: `More for ${entry.name}`,
                            entries: [
                              {
                                type: "item",
                                key: "rename",
                                label: PLEDGE_CLASS_SETTINGS_COPY.rename,
                                onSelect: () =>
                                  pushAddressTo(classHref(entry.id)),
                              },
                              {
                                type: "item",
                                key: "up",
                                label: PEOPLE_SETTINGS_COPY.moveUp,
                                disabled: index === 0,
                                onSelect: () => move(entry, -1),
                              },
                              {
                                type: "item",
                                key: "down",
                                label: PEOPLE_SETTINGS_COPY.moveDown,
                                disabled: index === classes.length - 1,
                                onSelect: () => move(entry, 1),
                              },
                              { type: "separator", key: "sep" },
                              {
                                type: "item",
                                key: "delete",
                                label: `Delete ${entry.name}`,
                                destructive: true,
                                onSelect: () => void deleteClass(entry),
                              },
                            ],
                          }
                        : null
                    }
                  />
                )}
              />
            </li>
          ) : (
            <li className="px-4 py-2.5 text-sm text-muted-foreground">
              {PLEDGE_CLASS_SETTINGS_COPY.empty}
            </li>
          )}
          {canManage ? (
            <SettingsAddRow
              label={addPledgeClassLabel(classTerm)}
              inputLabel={`New ${classTerm} name`}
              placeholder="Fall 2026"
              maxLength={PLEDGE_CLASS_NAME_MAX_LENGTH}
              full={
                full
                  ? `This chapter has ${PLEDGE_CLASSES_MAX}, the most it can hold.`
                  : null
              }
              onAdd={(name) =>
                run(
                  () => create.mutateAsync(name),
                  `Couldn't add ${name}`,
                  "Check that no other one has this name, then try again.",
                )
              }
            />
          ) : null}
        </SettingsGroup>
        {membersQuery.isError && !members ? (
          // Without the roster there are no counts and no member editor, so
          // say why and offer the read again.
          <InlineNote>
            Couldn&apos;t load the chapter&apos;s members, so counts and members
            are unavailable.{" "}
            <InlineNoteAction onClick={() => void membersQuery.refetch()}>
              Retry
            </InlineNoteAction>
          </InlineNote>
        ) : null}
        {canManage ? null : (
          <InlineNote>{PLEDGE_CLASS_SETTINGS_COPY.readOnly}</InlineNote>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {confirmDialog}
      {body}
    </div>
  );
}

/**
 * One class's page (`?tab=classes&class=<id>`): its name on top, saved on its
 * own; its members in the order the Directory will list them; ⋯ in the
 * header with Move up, Move down and Delete.
 *
 * The members' order is set by dragging a row, or by its grip's arrow keys
 * (#5738): the numbers follow the list (`renumberRows` says how), and there
 * is no number to type here. A chapter-wide roll's first number is set once
 * on a member's profile, and the class keeps counting from it. Nothing is
 * written until Save, which sends every change in one request the API
 * applies whole or not at all (Save stays until #6033 makes the settings
 * pages save on their own).
 *
 * Going back or leaving the page keeps the draft (#4593), with the roster it
 * was worked out against, so Save still sends only what the officer changed.
 * Cancel and Save give it up.
 */
function ClassPage({
  pledgeClass,
  classes,
  members,
  membersFailed,
  onRetryMembers,
  refetchMembers,
  canManage,
  classTerm,
  orderTerm,
  onMove,
  onDelete,
}: {
  pledgeClass: PledgeClass;
  classes: readonly PledgeClass[];
  /** `undefined` until the roster read answers. */
  members: readonly MemberProfile[] | undefined;
  membersFailed: boolean;
  onRetryMembers: () => void;
  refetchMembers: () => Promise<readonly MemberProfile[] | undefined>;
  canManage: boolean;
  classTerm: string;
  orderTerm: string;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
}) {
  const run = useToastedRun();
  const rename = useRenamePledgeClass();
  const index = classes.findIndex((entry) => entry.id === pledgeClass.id);
  const entries: RowMenuEntry[] = [
    {
      type: "item",
      key: "up",
      label: PEOPLE_SETTINGS_COPY.moveUp,
      disabled: index <= 0,
      onSelect: () => onMove(-1),
    },
    {
      type: "item",
      key: "down",
      label: PEOPLE_SETTINGS_COPY.moveDown,
      disabled: index < 0 || index >= classes.length - 1,
      onSelect: () => onMove(1),
    },
    { type: "separator", key: "sep" },
    {
      type: "item",
      key: "delete",
      label: `Delete ${pledgeClass.name}`,
      destructive: true,
      onSelect: onDelete,
    },
  ];

  return (
    <SettingsSubpage
      backHref={BASE}
      backLabel={classTerm}
      title={pledgeClass.name}
      actions={
        canManage ? (
          <ActionMenuButton
            entries={entries}
            label={`More for ${pledgeClass.name}`}
          />
        ) : null
      }
    >
      <SettingsNameField
        value={pledgeClass.name}
        maxLength={PLEDGE_CLASS_NAME_MAX_LENGTH}
        disabled={!canManage}
        onSave={(name) =>
          run(
            () => rename.mutateAsync({ id: pledgeClass.id, name }),
            `Couldn't rename ${pledgeClass.name}`,
            "Check that no other one has this name, then try again.",
          )
        }
      />
      {members ? (
        <ClassMembers
          pledgeClass={pledgeClass}
          classes={classes}
          members={members}
          refetchMembers={refetchMembers}
          canManage={canManage}
          orderTerm={orderTerm}
        />
      ) : membersFailed ? (
        <InlineNote>
          {PLEDGE_CLASS_SETTINGS_COPY.membersLoadFailed}{" "}
          <InlineNoteAction onClick={onRetryMembers}>Retry</InlineNoteAction>
        </InlineNote>
      ) : (
        <SettingsListCardSkeleton label="Loading members" />
      )}
    </SettingsSubpage>
  );
}

function ClassMembers({
  pledgeClass,
  classes,
  members: liveMembers,
  refetchMembers,
  canManage,
  orderTerm,
}: {
  pledgeClass: PledgeClass;
  classes: readonly PledgeClass[];
  members: readonly MemberProfile[];
  /** Reads the roster again and resolves with it (undefined if that fails). */
  refetchMembers: () => Promise<readonly MemberProfile[] | undefined>;
  canManage: boolean;
  orderTerm: string;
}) {
  const { toast } = useToast();
  const assign = useAssignPledgeClasses();
  const keptKeys = useKeptDraftKeys();
  // A viewer who can't change the class (one who lost `roles:manage` since
  // leaving a draft) reads the roster, never their own unsaved draft.
  const [opening] = useState(() =>
    canManage
      ? readKeptDraft<ClassDraft>(
          keptKeys.draft(classDraftName(pledgeClass.id)),
        )
      : undefined,
  );
  // The roster as it stood when the page opened. The rows are built from it
  // once, so the save is worked out against the same snapshot: a background
  // re-read that brings in a member another officer just added to this class
  // must not read as "the officer took them out". A kept draft brings its own.
  const [members, setMembers] = useState(() => opening?.members ?? liveMembers);
  const [rows, setRows] = useState<ClassEditorRow[]>(
    () => opening?.rows ?? classRowsOf(liveMembers, pledgeClass.id, classes),
  );

  const assignments = classAssignments(pledgeClass.id, rows, members);
  const invalid = assignments === null;
  const tooMany =
    assignments !== null && assignments.length > PLEDGE_CLASS_ASSIGNMENTS_MAX;
  const dirty = assignments === null || assignments.length > 0;

  const kept = useKeptFormDraft<ClassDraft>(
    classDraftName(pledgeClass.id),
    true,
    { members, rows },
    { signature: JSON.stringify(rows), restoredAtMount: opening !== undefined },
  );

  /** Start over from the roster as it is now. */
  function reset() {
    kept.discard();
    setMembers(liveMembers);
    setRows(classRowsOf(liveMembers, pledgeClass.id, classes));
  }

  const classNameById = useMemo(
    () => new Map(classes.map((entry) => [entry.id, entry.name])),
    [classes],
  );
  const inDraft = useMemo(
    () => new Set(rows.map((row) => row.memberId)),
    [rows],
  );
  // Everyone who can be added, in the phone's order too: members in no
  // class first, since a new class is usually made of them.
  const addable = useMemo(
    () => addableClassMembers(members, inDraft, classNameById),
    [members, inDraft, classNameById],
  );

  function addMember(entry: AddableMember) {
    setRows((previous) =>
      addRow(previous, { memberId: entry.member.id, name: entry.name }),
    );
  }

  async function handleSave() {
    if (!assignments || assignments.length === 0 || tooMany) return;
    kept.hold();
    try {
      await assign.mutateAsync(assignments);
      kept.drop();
      // The page stays open, so the next edit is worked out against the
      // roster as saved, not the one this page opened on: without it a
      // second Save re-sends the first, and taking out a member just added
      // writes nothing. The phone does the same.
      const fresh = await refetchMembers();
      if (fresh) {
        setMembers(fresh);
        setRows(classRowsOf(fresh, pledgeClass.id, classes));
      }
      toast({ title: `${pledgeClass.name} saved` });
    } catch (error) {
      kept.release();
      toast({
        title: `Couldn't save ${pledgeClass.name}`,
        description: getErrorMessage(
          error,
          "Nothing was changed. Reload the page and try again.",
        ),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-6">
      {canManage ? (
        <div className="max-w-md">
          <MemberSearchField
            label={PLEDGE_CLASS_SETTINGS_COPY.addMember}
            items={addable}
            nameOf={(entry) => entry.name}
            keyOf={(entry) => entry.member.id}
            detailOf={(entry) =>
              entry.movesFrom ? movesFromLabel(entry.movesFrom) : null
            }
            onAdd={addMember}
            emptyText={PLEDGE_CLASS_SETTINGS_COPY.everyoneIn}
            disabled={assign.isPending}
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <SectionLabel
          id="pledge-class-members"
          count={`${rows.length} · ${orderTerm}`}
        >
          {PLEDGE_CLASS_SETTINGS_COPY.members}
        </SectionLabel>
        {rows.length === 0 ? (
          <InlineNote>{PLEDGE_CLASS_SETTINGS_COPY.nobodyYet}</InlineNote>
        ) : (
          <ReorderList
            grouped
            className="rounded-[14px] border border-border bg-card"
            aria-label={`Members of ${pledgeClass.name}`}
            items={rows}
            getId={(row) => row.memberId}
            getLabel={(row) => row.name}
            onReorder={(next) => setRows(renumberRows(next))}
            disabled={!canManage || assign.isPending}
            renderItem={(row) => (
              <div className="flex min-h-control-settings-row items-center gap-3 px-2 py-1 pointer-coarse:min-h-11">
                {/* The number follows the row's place, not a field. */}
                <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                  {row.number}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm">{row.name}</p>
                {canManage ? (
                  <IconButton
                    label={`Remove ${row.name} from ${pledgeClass.name}`}
                    disabled={assign.isPending}
                    onClick={() =>
                      setRows((previous) =>
                        previous.filter(
                          (entry) => entry.memberId !== row.memberId,
                        ),
                      )
                    }
                  >
                    <X className="h-4 w-4" />
                  </IconButton>
                ) : null}
              </div>
            )}
          />
        )}
        {tooMany ? (
          <p role="alert" className="text-caption text-destructive-text">
            That is more than {PLEDGE_CLASS_ASSIGNMENTS_MAX} changes at once.
            Save a smaller set first.
          </p>
        ) : null}
      </div>

      {canManage && (dirty || kept.restored) ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {kept.restored ? <KeptDraftNote onDiscard={reset} /> : null}
          <Button
            variant="secondary"
            onClick={reset}
            disabled={assign.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={!dirty || invalid || tooMany || assign.isPending}
          >
            {assign.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Save
          </Button>
        </div>
      ) : null}
    </div>
  );
}
