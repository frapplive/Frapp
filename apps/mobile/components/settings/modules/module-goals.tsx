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
import { goalPerUnit, goalSummary } from "@repo/hooks/module-settings";
import {
  GOAL_METRIC_COPY,
  GOAL_PAGE_COPY,
  GOAL_ROLE_LIMIT,
  GOAL_TARGET_MAX,
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

/** The goal as typed, in the unit its row shows. */
const shown = (metric: GoalMetric, stored: number | null) =>
  stored === null ? null : Math.round(stored / goalPerUnit(metric));
const toStored = (metric: GoalMetric, typed: number | null) =>
  typed === null ? null : typed * goalPerUnit(metric);

/** One measure's screen, pushed from its Goals row. */
export function GoalPage({
  metric,
  canManage,
}: {
  metric: GoalMetric;
  canManage: boolean;
}) {
  const { tokens } = useFrappTheme();
  const goals = useChapterGoals();
  const roles = useRoles();
  const save = useSetChapterGoals(metric);
  const addSheet = useRef<BottomSheetModal>(null);
  // Roles added here and not yet given a number: they show as empty rows and
  // save once one is typed. One left empty was never sent.
  const [added, setAdded] = useState<readonly string[]>([]);
  const copy = GOAL_METRIC_COPY[metric];

  if (goals.isError || roles.isError) {
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
  if (!goals.data || !roles.data) {
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
  const roleOptions = toRoleOptions(roles.data);
  const nameOf = new Map(roleOptions.map((role) => [role.id, role.name]));
  const max = Math.floor(GOAL_TARGET_MAX[metric] / goalPerUnit(metric));
  const savedRoleIds = saved.roles.map((goal) => goal.role_id);
  const pendingIds = added.filter((id) => !savedRoleIds.includes(id));
  const rowIds = [...savedRoleIds, ...pendingIds];
  const unset = roleOptions.filter((role) => !rowIds.includes(role.id));

  /** The whole goal with one change, as the route takes it. */
  function send(next: GoalSet) {
    return save.mutateAsync(next);
  }
  function withRole(roleId: string, typed: number | null): GoalSet {
    const target = toStored(metric, typed);
    const has = saved.roles.some((goal) => goal.role_id === roleId);
    return {
      everyone: saved.everyone,
      roles: has
        ? saved.roles.map((goal) =>
            goal.role_id === roleId ? { role_id: roleId, target } : goal,
          )
        : [...saved.roles, { role_id: roleId, target }],
    };
  }
  function remove(roleId: string): Promise<unknown> {
    setAdded((prev) => prev.filter((id) => id !== roleId));
    if (!savedRoleIds.includes(roleId)) return Promise.resolve();
    return send({
      everyone: saved.everyone,
      roles: saved.roles.filter((goal) => goal.role_id !== roleId),
    });
  }

  return (
    <>
      <FormHint>{GOAL_PAGE_COPY.hint}</FormHint>
      <ListSection footnote={canManage ? null : ROLE_CANT_CHANGE_THESE}>
        <NumberRow
          label={copy.label}
          hint={copy.hint}
          suffix={copy.suffix}
          value={shown(metric, saved.everyone)}
          min={1}
          max={max}
          allowEmpty
          editable={canManage}
          onSave={(typed) =>
            send({ everyone: toStored(metric, typed), roles: saved.roles })
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
              value={shown(metric, target)}
              min={1}
              max={max}
              allowEmpty
              editable={canManage}
              onSave={(typed) => send(withRole(roleId, typed))}
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
