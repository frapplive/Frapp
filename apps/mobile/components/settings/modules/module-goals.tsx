import { useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  useChapterGoals,
  useRoles,
  useSetChapterGoals,
  type GoalSet,
} from "@repo/hooks";
import { toRoleOptions } from "@repo/hooks/chapter-roles";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import {
  goalSummary,
  goalToStored,
  goalToTyped,
  goalTypedMax,
} from "@repo/hooks/module-settings";
import {
  GOAL_METRIC_COPY,
  GOAL_PAGE_COPY,
  GOAL_ROLE_LIMIT,
  GOALS_FOOTNOTE,
  ROLE_CANT_CHANGE_THESE,
  goalRoleHint,
  type GoalMetric,
} from "@repo/validation";
import { PlusGlyph } from "@/components/control-glyphs";
import {
  ListRow,
  ListRowSkeleton,
  ListSection,
  SectionHeader,
} from "@/components/list-section";
import { OptionSheet } from "@/components/option-sheet";
import { FormHint } from "@/components/settings/chapter-form";
import { NumberRow } from "@/components/settings/modules/number-row";
import { TargetGlyph } from "@/components/settings-glyphs";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { useFrappTheme } from "@/lib/theme";

/**
 * A module screen's Goals on the phone (#1062, #6030), web's
 * `module-goals.tsx` in the phone's rows: a row per measure with the goal
 * everyone is held to and how many roles differ, pushing that measure's own
 * screen, where the goal for everyone and any role set apart with its own
 * are typed in place. Each number saves on its own when its field is left
 * (rulebook § 9), as the whole goal (`PUT /v1/goals/:metric`,
 * `chapter-config:manage`).
 */

/** The module screen's Goals group. */
export function ModuleGoalsSection({
  metrics,
  onOpen,
}: {
  metrics: readonly GoalMetric[];
  onOpen: (metric: GoalMetric) => void;
}) {
  const { tokens } = useFrappTheme();
  const goals = useChapterGoals();
  return (
    <>
      <SectionHeader>Goals</SectionHeader>
      <ListSection footnote={GOALS_FOOTNOTE}>
        {metrics.map((metric) => (
          <ListRow
            key={metric}
            leading={<TargetGlyph color={tokens.color.text.mutedForeground} />}
            label={GOAL_METRIC_COPY[metric].label}
            value={
              goals.isPending
                ? "Loading"
                : goals.isError
                  ? "Couldn't load"
                  : goalSummary(metric, goals.data[metric])
            }
            accessibilityHint="Opens the goal and any role's own."
            onPress={() => onOpen(metric)}
          />
        ))}
      </ListSection>
    </>
  );
}

/**
 * One measure's screen, pushed from its Goals row. A role's own goal needs
 * the chapter's roles, which `GET /v1/roles` reads for `members:view`; a
 * viewer without it sets the goal for everyone, and the roles set apart are
 * kept as they are.
 */
export function GoalPage({
  metric,
  canManage,
  canSeeRoles,
}: {
  metric: GoalMetric;
  canManage: boolean;
  canSeeRoles: boolean;
}) {
  const { tokens } = useFrappTheme();
  const goals = useChapterGoals();
  const roles = useRoles({ enabled: canSeeRoles });
  const save = useSetChapterGoals(metric);
  // One save at a time, each built on the one before it: every row sends the
  // whole goal, so two saves built on the same read would undo each other.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const lastSent = useRef<GoalSet | null>(null);
  const pending = useRef(0);
  const addSheet = useRef<BottomSheetModal>(null);
  // Roles added here and not yet given a number: they show as empty rows and
  // save once one is typed. One left empty was never sent.
  const [added, setAdded] = useState<readonly string[]>([]);
  const copy = GOAL_METRIC_COPY[metric];

  const rolesFailed = canSeeRoles && roles.isError;
  if (goals.isError || rolesFailed) {
    return (
      <ErrorState
        title="Couldn't load the goals"
        body={describeLoadFailure(goals.error ?? roles.error)}
        onRetry={() => {
          void goals.refetch();
          void roles.refetch();
        }}
        isRetrying={goals.isFetching || roles.isFetching}
      />
    );
  }
  if (!goals.data || (canSeeRoles && !roles.data)) {
    return (
      <SkeletonRegion label="Loading the goals">
        <ListSection>
          {[0, 1, 2].map((index) => (
            <ListRowSkeleton key={index} index={index} description />
          ))}
        </ListSection>
      </SkeletonRegion>
    );
  }

  const saved: GoalSet = goals.data[metric];
  const roleOptions = canSeeRoles ? toRoleOptions(roles.data) : [];
  const nameOf = new Map(roleOptions.map((role) => [role.id, role.name]));
  const max = goalTypedMax(metric);
  const savedRoleIds = saved.roles.map((goal) => goal.role_id);
  const pendingIds = added.filter((id) => !savedRoleIds.includes(id));
  const rowIds = canSeeRoles ? [...savedRoleIds, ...pendingIds] : [];
  const unset = roleOptions.filter((role) => !rowIds.includes(role.id));

  /**
   * Saves the whole goal with one change, after any save still out, on top
   * of what that one sent; with none out, on top of the goal as read.
   */
  function update(change: (current: GoalSet) => GoalSet): Promise<unknown> {
    const read = saved;
    pending.current += 1;
    const run = chain.current.then(async () => {
      const next = change(lastSent.current ?? read);
      await save.mutateAsync(next);
      lastSent.current = next;
    });
    const settled = run.finally(() => {
      pending.current -= 1;
      if (pending.current === 0) lastSent.current = null;
    });
    chain.current = settled.catch(() => undefined);
    return settled;
  }
  function withRole(roleId: string, typed: number | null) {
    const target = goalToStored(metric, typed);
    return (current: GoalSet): GoalSet => ({
      everyone: current.everyone,
      roles: current.roles.some((goal) => goal.role_id === roleId)
        ? current.roles.map((goal) =>
            goal.role_id === roleId ? { role_id: roleId, target } : goal,
          )
        : [...current.roles, { role_id: roleId, target }],
    });
  }
  function remove(roleId: string): Promise<unknown> {
    setAdded((prev) => prev.filter((id) => id !== roleId));
    if (!savedRoleIds.includes(roleId)) return Promise.resolve();
    return update((current) => ({
      everyone: current.everyone,
      roles: current.roles.filter((goal) => goal.role_id !== roleId),
    }));
  }

  return (
    <>
      <FormHint>{GOAL_PAGE_COPY.hint}</FormHint>
      <ListSection footnote={canManage ? null : ROLE_CANT_CHANGE_THESE}>
        <NumberRow
          label={copy.label}
          hint={copy.hint}
          suffix={copy.suffix}
          value={goalToTyped(metric, saved.everyone)}
          min={1}
          max={max}
          allowEmpty
          editable={canManage}
          onSave={(typed) =>
            update((current) => ({
              everyone: goalToStored(metric, typed),
              roles: current.roles,
            }))
          }
        />
        {rowIds.map((roleId) => {
          const name = nameOf.get(roleId) ?? GOAL_PAGE_COPY.removedRole;
          const target =
            saved.roles.find((goal) => goal.role_id === roleId)?.target ?? null;
          return (
            <NumberRow
              key={roleId}
              label={name}
              hint={goalRoleHint(name)}
              suffix={copy.suffix}
              value={goalToTyped(metric, target)}
              min={1}
              max={max}
              allowEmpty
              editable={canManage}
              onSave={(typed) => update(withRole(roleId, typed))}
              onRemove={
                canManage
                  ? {
                      label: `Remove ${name}'s own ${copy.label.toLowerCase()}`,
                      run: () => remove(roleId),
                    }
                  : undefined
              }
            />
          );
        })}
        {canManage && unset.length > 0 && rowIds.length < GOAL_ROLE_LIMIT ? (
          <ListRow
            label={GOAL_PAGE_COPY.addRole}
            leading={<PlusGlyph color={tokens.color.text.mutedForeground} />}
            accessibilityHint="Opens the roles without a goal of their own."
            onPress={() => addSheet.current?.present()}
          />
        ) : null}
      </ListSection>
      {canManage ? (
        <OptionSheet
          ref={addSheet}
          title={GOAL_PAGE_COPY.addRole}
          options={unset.map((role) => ({ value: role.id, label: role.name }))}
          selected={null}
          searchPlaceholder={GOAL_PAGE_COPY.findRole}
          onSelect={(roleId) => {
            if (roleId) setAdded((prev) => [...prev, roleId]);
          }}
        />
      ) : null}
    </>
  );
}
