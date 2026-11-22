"use client";

import React, { useState } from "react";
import {
  useCreateEventType,
  useDeleteEventType,
  useEventTypes,
  useUpdateEventType,
  type EventType,
} from "@repo/hooks";
import {
  describeEventTypeSets,
  EVENT_FORM_PLACEHOLDERS,
  EVENT_FORM_ROW_LABELS,
  EVENT_TYPE_NAME_MAX_LENGTH,
  EVENT_TYPES_MAX,
  tidyTypeName,
  typeToAdd,
  type EventTypeDraft,
} from "@repo/validation";
import {
  TypeEditPane,
  TypeMenu,
  useTypeEditor,
  type TypeEditorHandle,
} from "@/components/shared/type-menu";
import { Input } from "@/components/ui/input";
import {
  PropertyRow,
  RowValueButton,
} from "@/components/events/event-form-rows";
import { Label } from "@/components/ui/label";
import { SegmentedChoice } from "@/components/ui/segmented";
import { guardIntDraft, parseGuardedInt } from "@/lib/utils";

/**
 * The Type row of the event form (`spec/behavior/events.md` § Event types,
 * #5561): the chapter's kinds of event in a menu that finds one as you type,
 * none held until the officer picks. Picking one is a shortcut, not a lock:
 * the form fills in the type's points and attendance and the officer can
 * still change either. "No type" lets the held one go.
 *
 * A menu rather than the row of chips it replaced: seven types
 * already wrapped to two lines and a chapter may keep 30, pushing the name
 * down the form. Comparable: Linear's label and status menus, which search,
 * and Google Calendar's event-type tabs. Each type says what it sets ("10
 * points · Required", `describeEventTypeSets`, the words the phone's Type
 * sheet shows); a member, whose event carries neither, sees the names alone.
 *
 * `canManage` (`events:update`) also makes a type in place (Paul
 * 2026-11-20, "add a type in the moment"): the menu's search always shows,
 * as "Find or add a type", and a name no type has yet offers
 * "Create “Work party”", which makes the type from the form's points and
 * attendance (`typeFromForm`) and holds it. Linear's and Notion's label menus
 * create what was typed the same way.
 *
 * `canManage` (`events:update`) also edits a type from its row in the menu
 * (name, points, attendance, Delete type), so an officer who finds the list
 * wrong fixes it where they noticed. The menu is the shared `TypeMenu`
 * (`shared/type-menu.tsx`), which document types use too (Paul 2026-11-22).
 */
export function EventTypeRow({
  value,
  onPick,
  canManage,
  showSets,
  typeFromForm,
  disabled = false,
}: {
  value: string | null;
  /**
   * `null` when the officer picks No type. `made` is true for a type just
   * made from the form, which the form holds without refilling from it.
   */
  onPick: (type: EventType | null, made?: boolean) => void;
  canManage: boolean;
  /** The type "Create “…”" makes, from the form as it stands. */
  typeFromForm: (name: string) => EventTypeDraft;
  /** Whether each type says what it sets: not for a member (#3709). */
  showSets: boolean;
  disabled?: boolean;
}) {
  const typesQuery = useEventTypes();
  const types = typesQuery.data ?? [];
  const createType = useCreateEventType();
  // A chapter with no types and nobody to make them sees no row at all.
  if (!canManage && types.length === 0) return null;
  const held = types.find((type) => type.id === value) ?? null;

  return (
    <PropertyRow glyph="type" label={EVENT_FORM_ROW_LABELS.type}>
      <TypeMenu
        label="Event type"
        types={types}
        isHeld={(type) => type.id === value}
        onPick={(type) => onPick(type)}
        toAdd={
          canManage
            ? (typed) =>
                typeToAdd(typed, types, {
                  max: EVENT_TYPES_MAX,
                  maxLength: EVENT_TYPE_NAME_MAX_LENGTH,
                })
            : undefined
        }
        onCreate={
          canManage
            ? async (name) => {
                const created = await createType.mutateAsync(
                  typeFromForm(name),
                );
                onPick(created, true);
              }
            : undefined
        }
        describe={showSets ? describeEventTypeSets : undefined}
        renderEditor={
          canManage
            ? (type, handle) => (
                <EventTypeEdit key={type.id} type={type} handle={handle} />
              )
            : undefined
        }
        trigger={
          <RowValueButton
            empty={!held}
            disabled={disabled}
            aria-label={`Type: ${held?.name ?? "none"}`}
          >
            {typesQuery.isLoading
              ? "Loading types"
              : (held?.name ?? EVENT_FORM_PLACEHOLDERS.type)}
          </RowValueButton>
        }
      />
    </PropertyRow>
  );
}

const ATTENDANCE_OPTIONS = [
  { value: "optional", label: "Optional" },
  { value: "required", label: "Required" },
] as const;

/**
 * One event type's edit view in the Type menu: its name, the points and
 * attendance picking it fills in, and Delete type. Events already made keep
 * what they have; the form holding this type keeps its own values too.
 */
function EventTypeEdit({
  type,
  handle,
}: {
  type: EventType;
  handle: TypeEditorHandle;
}) {
  const updateType = useUpdateEventType();
  const deleteType = useDeleteEventType();
  const [name, setName] = useState(type.name);
  const [points, setPoints] = useState(String(type.point_value));
  const [required, setRequired] = useState(type.is_mandatory);
  const tidy = tidyTypeName(name);
  const editor = useTypeEditor({
    handle,
    changed:
      tidy !== type.name ||
      points.trim() !== String(type.point_value) ||
      required !== type.is_mandatory,
    save: async () => {
      if (!tidy) return "Give the type a name.";
      const pointValue = points.trim() === "" ? 0 : parseGuardedInt(points);
      if (pointValue === undefined) {
        return "Points must be a whole number of 0 or more.";
      }
      await updateType.mutateAsync({
        id: type.id,
        body: { name: tidy, point_value: pointValue, is_mandatory: required },
      });
      return null;
    },
    remove: () => deleteType.mutateAsync(type.id),
  });
  const idBase = `event-type-${type.id}`;

  return (
    <TypeEditPane
      id={idBase}
      name={name}
      nameMaxLength={EVENT_TYPE_NAME_MAX_LENGTH}
      onNameChange={(next) => {
        editor.clearError();
        setName(next);
      }}
      error={editor.error}
      saving={editor.saving}
      onLeave={editor.leave}
      deleteConsequence="Its events keep their points and lose the type."
      deletePending={editor.deleting}
      onDelete={editor.onDelete}
    >
      <div className="flex items-center gap-2">
        <Label htmlFor={`${idBase}-points`} className="w-16 shrink-0">
          Points
        </Label>
        <Input
          id={`${idBase}-points`}
          type="number"
          min={0}
          className="w-20"
          value={points}
          onChange={(event) => {
            const next = guardIntDraft(event.target.value);
            if (next === undefined) return;
            editor.clearError();
            setPoints(next);
          }}
        />
      </div>
      <SegmentedChoice
        label="Attendance for everyone"
        options={ATTENDANCE_OPTIONS}
        value={required ? "required" : "optional"}
        onChange={(next) => setRequired(next === "required")}
        fill
      />
    </TypeEditPane>
  );
}
