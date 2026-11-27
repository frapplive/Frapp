"use client";

import { useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  Hash,
  Loader2,
  List,
  Phone,
  Plus,
  Ruler,
  ToggleLeft,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  deleteMemberFieldConfirm,
  keyFromLabel,
  MEMBER_FIELD_TYPE_LABEL,
  MEMBER_FIELD_VISIBILITY_LABEL,
  MEMBER_FIELDS_COPY,
  memberFieldFacts,
  memberFieldSortPatches,
  moveId,
  PEOPLE_SETTINGS_COPY,
  type ChapterCustomField,
  type CustomFieldType,
  type CustomFieldVisibility,
} from "@repo/validation";
import {
  useCreateCustomField,
  useCustomFields,
  useDeleteCustomField,
  useUpdateCustomField,
} from "@repo/hooks";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { InlineNote } from "@/components/shared/inline-note";
import { ReorderList } from "@/components/shared/reorder-list";
import {
  ActionMenuButton,
  type RowMenuEntry,
} from "@/components/shared/row-menu";
import { SettingsAddRow } from "@/components/shared/settings-add-row";
import {
  SETTINGS_VALUE_TRIGGER,
  SettingsGroup,
  SettingsReorderRow,
  SettingsRow,
} from "@/components/shared/settings-row";
import { SettingsListCardSkeleton } from "@/components/settings/settings-skeleton";
import { SettingsNameField } from "@/components/settings/settings-name-field";
import { SettingsSubpage } from "@/components/settings/settings-subpage";
import { useToastedRun } from "@/lib/hooks/use-toasted-run";
import { useNetwork } from "@/lib/providers/network-provider";
import { guardIntDraft, parseGuardedInt } from "@/lib/utils";

type Props = {
  /** Whether the caller holds `chapter-config:manage`. */
  canManage: boolean;
};

const BASE = "/settings?tab=fields";
/** `?field=new`: the empty field page "Add a field" opens. */
const NEW = "new";

function fieldHref(id: string): string {
  return `${BASE}&field=${encodeURIComponent(id)}`;
}

/** The picker's order: the everyday types first. */
const FIELD_TYPES: readonly CustomFieldType[] = [
  "text",
  "select",
  "boolean",
  "phone",
  "number",
  "decimal",
];

const VISIBILITIES: readonly CustomFieldVisibility[] = [
  "chapter",
  "exec",
  "president",
  "self",
];

/** Each type's glyph, the same on its row and the phone's. */
const TYPE_ICON: Record<CustomFieldType, LucideIcon> = {
  text: Type,
  number: Hash,
  decimal: Hash,
  phone: Phone,
  select: List,
  boolean: ToggleLeft,
};

/**
 * Settings → Member fields: the chapter's own questions every member answers
 * under More details (`chapter_custom_fields`). In the settings shape since
 * #6029 (Paul's Discord channel-settings ruling; Slack's custom profile
 * fields are the same list): one group of rows, each the type's glyph, the
 * field's name, its type and flags, who sees it and a chevron to its page,
 * dragged into order. "Add a field" is the last row and opens the same page,
 * empty.
 *
 * | URL | Page |
 * | --- | ---- |
 * | `?tab=fields` | The list |
 * | `?tab=fields&field=<id>` | A field: name, type, options, who sees it, Required and Sensitive (`FieldPage`) |
 * | `?tab=fields&field=new` | A new field (`NewFieldPage`) |
 *
 * Every write is audit-logged by the API and saves the moment it changes; a
 * new field waits for "Add field". The phone draws the same list and pages
 * (`apps/mobile/app/(app)/member-fields.tsx`) in the same words
 * (`MEMBER_FIELDS_COPY`).
 */
export function SettingsFieldsTab({ canManage }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fieldId = searchParams.get("field");
  const fieldsQuery = useCustomFields();
  const updateField = useUpdateCustomField();
  const deleteField = useDeleteCustomField();
  const run = useToastedRun();
  const { isOffline } = useNetwork();
  // Above the loading and error branches: a background refetch that fails
  // with a delete confirmation open must not unmount it (`ConfirmDialogHost`
  // settles the pending promise `null` on the way out, so the click would
  // silently stop existing).
  const { confirm, confirmDialog } = useConfirmDialog();
  // The order as just dropped, shown until the writes and the re-read answer.
  const [pendingOrder, setPendingOrder] = useState<ChapterCustomField[] | null>(
    null,
  );

  const saved = fieldsQuery.data ?? [];
  const fields = pendingOrder ?? saved;

  async function reorder(next: ChapterCustomField[]) {
    // One order at a time: a move made while one saves waits for it.
    if (pendingOrder) return;
    setPendingOrder(next);
    const patches = memberFieldSortPatches(
      next.map((field) => field.id),
      saved,
    );
    // One write per field whose place changed, in turn: each is its own
    // Logs entry, and the API has no whole-list order for fields.
    await run(
      async () => {
        for (const patch of patches) {
          await updateField.mutateAsync({
            id: patch.id,
            body: { sort: patch.sort },
          });
        }
      },
      "Couldn't save the order",
      "Part of it may have saved. Reload to see where each field is.",
    );
    setPendingOrder(null);
  }

  function move(field: ChapterCustomField, by: -1 | 1) {
    const ids = moveId(
      fields.map((candidate) => candidate.id),
      field.id,
      by,
    );
    if (!ids) return;
    const byId = new Map(fields.map((candidate) => [candidate.id, candidate]));
    void reorder(ids.map((id) => byId.get(id)!));
  }

  async function remove(field: ChapterCustomField): Promise<boolean> {
    const ok = await confirm({
      ...confirmWords(deleteMemberFieldConfirm(field.label)),
      tone: "destructive",
    });
    if (!ok) return false;
    return run(
      () => deleteField.mutateAsync(field.id),
      `Couldn't delete ${field.label}`,
      "Retry in a moment.",
    );
  }

  function menuFor(
    field: ChapterCustomField,
    index: number,
    onDelete: () => void = () => void remove(field),
  ): RowMenuEntry[] {
    return [
      {
        type: "item",
        key: "up",
        label: PEOPLE_SETTINGS_COPY.moveUp,
        disabled: index <= 0,
        onSelect: () => move(field, -1),
      },
      {
        type: "item",
        key: "down",
        label: PEOPLE_SETTINGS_COPY.moveDown,
        disabled: index < 0 || index >= fields.length - 1,
        onSelect: () => move(field, 1),
      },
      { type: "separator", key: "sep" },
      {
        type: "item",
        key: "delete",
        label: MEMBER_FIELDS_COPY.deleteField,
        destructive: true,
        onSelect: onDelete,
      },
    ];
  }

  let body: ReactNode;
  if (isOffline && anyReadUncached(fieldsQuery)) {
    body = (
      <OfflineState
        title="Member fields are unavailable offline"
        description="Reconnect to load them and make changes."
        onRetry={() => void fieldsQuery.refetch()}
      />
    );
  } else if (fieldsQuery.isLoading || pausedRead(fieldsQuery)) {
    body = <SettingsListCardSkeleton label="Loading member fields" />;
  } else if (fieldsQuery.isError && fieldsQuery.data === undefined) {
    body = (
      <ErrorState
        title="Couldn't load member fields"
        description="Retry to fetch them again."
        onRetry={() => void fieldsQuery.refetch()}
      />
    );
  } else if (fieldId === NEW && canManage) {
    body = (
      <NewFieldPage
        existingKeys={saved.map((field) => field.key)}
        onCreated={(id) => router.replace(fieldHref(id))}
      />
    );
  } else if (fieldId) {
    const index = saved.findIndex((field) => field.id === fieldId);
    const field = saved[index];
    body = field ? (
      <FieldPage
        key={field.id}
        field={field}
        canManage={canManage}
        menu={menuFor(
          field,
          index,
          () =>
            void remove(field).then((gone) => {
              if (gone) router.push(BASE);
            }),
        )}
      />
    ) : (
      <SettingsSubpage
        backHref={BASE}
        backLabel={MEMBER_FIELDS_COPY.pageTitle}
        title={MEMBER_FIELDS_COPY.pageTitle}
      >
        <InlineNote>
          This field is gone. Someone may have deleted it.
        </InlineNote>
      </SettingsSubpage>
    );
  } else {
    body = (
      <div className="space-y-4">
        <h2 className="text-title text-foreground">
          {MEMBER_FIELDS_COPY.pageTitle}
        </h2>
        <SettingsGroup
          id="settings-custom-member-fields"
          label={MEMBER_FIELDS_COPY.pageTitle}
          footnote={MEMBER_FIELDS_COPY.footnote}
        >
          {fields.length > 0 ? (
            <li>
              <ReorderList
                grouped
                aria-label={MEMBER_FIELDS_COPY.pageTitle}
                items={fields}
                getId={(field) => field.id}
                getLabel={(field) => field.label}
                onReorder={(next) => void reorder(next)}
                disabled={!canManage}
                renderItem={(field, index) => (
                  <SettingsReorderRow
                    href={fieldHref(field.id)}
                    icon={TYPE_ICON[field.type]}
                    label={field.label}
                    description={memberFieldFacts(field)}
                    value={MEMBER_FIELD_VISIBILITY_LABEL[field.visibility]}
                    menu={
                      canManage
                        ? {
                            entries: menuFor(field, index),
                            label: `More for ${field.label}`,
                          }
                        : null
                    }
                  />
                )}
              />
            </li>
          ) : (
            <li className="px-4 py-2.5 text-sm text-muted-foreground">
              {MEMBER_FIELDS_COPY.empty}
            </li>
          )}
          {canManage ? (
            <SettingsRow
              icon={Plus}
              label={MEMBER_FIELDS_COPY.addField}
              href={fieldHref(NEW)}
              // Keeps the ⋯'s room the field rows above have, so the
              // chevrons line up.
              menu={{ entries: [], label: MEMBER_FIELDS_COPY.addField }}
            />
          ) : null}
        </SettingsGroup>
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
 * One field's page: its name on top, then what it asks and who sees it. Each
 * row saves the moment it changes, as settings do (rulebook § 9); the type is
 * fixed once made, since the API can't change it.
 */
function FieldPage({
  field,
  canManage,
  menu,
}: {
  field: ChapterCustomField;
  canManage: boolean;
  /** The header's ⋯: Move up, Move down, Delete. */
  menu: RowMenuEntry[];
}) {
  const update = useUpdateCustomField();
  const run = useToastedRun();
  const patch = (
    body: Parameters<typeof update.mutateAsync>[0]["body"],
    failTitle = `Couldn't change ${field.label}`,
  ) =>
    run(
      () => update.mutateAsync({ id: field.id, body }),
      failTitle,
      "Your change wasn't saved. Try again in a moment.",
    );
  const choices = field.options?.choices ?? [];

  return (
    <SettingsSubpage
      backHref={BASE}
      backLabel={MEMBER_FIELDS_COPY.pageTitle}
      title={field.label}
      actions={
        canManage ? (
          <ActionMenuButton entries={menu} label={`More for ${field.label}`} />
        ) : null
      }
    >
      <SettingsNameField
        value={field.label}
        maxLength={120}
        disabled={!canManage}
        onSave={(label) => patch({ label }, `Couldn't rename ${field.label}`)}
      />
      <SettingsGroup label={field.label}>
        <SettingsRow
          icon={TYPE_ICON[field.type]}
          label={MEMBER_FIELDS_COPY.type}
          control={
            <span className="px-2 text-sm text-muted-foreground">
              {MEMBER_FIELD_TYPE_LABEL[field.type]}
            </span>
          }
        />
        {field.type === "text" ? (
          <LongestAnswerRow
            value={field.options?.max_length ?? null}
            disabled={!canManage}
            onSave={(max) =>
              patch({
                options: max === null ? null : { max_length: max },
              })
            }
          />
        ) : null}
        <VisibilityRow
          value={field.visibility}
          disabled={!canManage}
          onChange={(visibility) => void patch({ visibility })}
        />
        <SettingsRow
          label={MEMBER_FIELDS_COPY.required}
          checked={field.required}
          disabled={!canManage}
          onCheckedChange={(required) => void patch({ required })}
        />
        <SettingsRow
          label={MEMBER_FIELDS_COPY.sensitive}
          checked={field.sensitive}
          disabled={!canManage}
          onCheckedChange={(sensitive) => void patch({ sensitive })}
        />
      </SettingsGroup>
      {field.type === "select" ? (
        <OptionsGroup
          choices={choices}
          disabled={!canManage}
          onChange={(next) =>
            patch({ options: { choices: next } }, "Couldn't change the options")
          }
        />
      ) : null}
    </SettingsSubpage>
  );
}

/** Who sees a field's values besides its member, saved on the pick. */
function VisibilityRow({
  value,
  disabled,
  onChange,
}: {
  value: CustomFieldVisibility;
  disabled: boolean;
  onChange: (next: CustomFieldVisibility) => void;
}) {
  return (
    <SettingsRow
      icon={Eye}
      label={MEMBER_FIELDS_COPY.visibleTo}
      control={
        <Select
          value={value}
          disabled={disabled}
          onValueChange={(next) => onChange(next as CustomFieldVisibility)}
        >
          <SelectTrigger
            aria-label={MEMBER_FIELDS_COPY.visibleTo}
            className={SETTINGS_VALUE_TRIGGER}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {VISIBILITIES.map((visibility) => (
              <SelectItem key={visibility} value={visibility}>
                {MEMBER_FIELD_VISIBILITY_LABEL[visibility]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}

/**
 * A text field's longest answer: a number typed in place, saved on Enter or
 * on leaving it; cleared, it's "No limit". Escape puts the saved value back.
 */
function LongestAnswerRow({
  value,
  disabled,
  onSave,
}: {
  value: number | null;
  disabled: boolean;
  onSave: (next: number | null) => Promise<boolean> | void;
}) {
  const saved = value === null ? "" : String(value);
  const [text, setText] = useState(saved);
  function commit() {
    const next = text === "" ? null : (parseGuardedInt(text, 1) ?? undefined);
    if (next === undefined) {
      setText(saved);
      return;
    }
    if (next !== value) void onSave(next);
  }
  return (
    <SettingsRow
      icon={Ruler}
      label={MEMBER_FIELDS_COPY.maxLength}
      control={
        <Input
          aria-label={MEMBER_FIELDS_COPY.maxLength}
          inputMode="numeric"
          value={text}
          disabled={disabled}
          placeholder={MEMBER_FIELDS_COPY.noLimit}
          onChange={(event) => {
            const next = guardIntDraft(event.target.value);
            if (next !== undefined) setText(next);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setText(saved);
            }
          }}
          className="h-control-small w-28 text-right"
        />
      }
    />
  );
}

/**
 * A pick-one field's options: one row each, dragged into order, removed with
 * its X, and "Add an option" last. Each change saves the whole list, which the
 * API takes in place of the old one; the last option can't go, since a
 * pick-one field must offer one.
 */
function OptionsGroup({
  choices,
  disabled,
  keepOne = true,
  onChange,
}: {
  choices: readonly string[];
  disabled: boolean;
  /** A made pick-one field keeps at least one option; a new one may empty. */
  keepOne?: boolean;
  onChange: (next: string[]) => Promise<boolean>;
}) {
  const [pending, setPending] = useState<string[] | null>(null);
  const shown = pending ?? [...choices];
  async function save(next: string[]) {
    setPending(next);
    await onChange(next);
    setPending(null);
  }
  return (
    <SettingsGroup heading={MEMBER_FIELDS_COPY.options}>
      {shown.length > 0 ? (
        <li>
          <ReorderList
            grouped
            aria-label={MEMBER_FIELDS_COPY.options}
            items={shown}
            getId={(choice) => choice}
            getLabel={(choice) => choice}
            onReorder={(next) => void save(next)}
            disabled={disabled}
            renderItem={(choice) => (
              <div className="flex min-h-control-settings-row items-center gap-3 px-2 py-1 pointer-coarse:min-h-11">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {choice}
                </span>
                {disabled ? null : (
                  <IconButton
                    label={`Remove ${choice}`}
                    disabled={keepOne && shown.length <= 1}
                    onClick={() =>
                      void save(shown.filter((entry) => entry !== choice))
                    }
                  >
                    <X className="h-4 w-4" />
                  </IconButton>
                )}
              </div>
            )}
          />
        </li>
      ) : null}
      {disabled ? null : (
        <SettingsAddRow
          label={MEMBER_FIELDS_COPY.addOption}
          inputLabel="New option"
          placeholder="Medium"
          maxLength={120}
          submitLabel="Add"
          onAdd={async (choice) => {
            if (shown.includes(choice)) return true;
            const next = [...shown, choice];
            setPending(next);
            const ok = await onChange(next);
            setPending(null);
            return ok;
          }}
        />
      )}
    </SettingsGroup>
  );
}

/**
 * "Add a field": the field page, empty, held here until "Add field" makes it.
 * The button sits in the header and says what's missing while it can't be
 * pressed (rulebook § 9). Its key comes from its name (`keyFromLabel`), so
 * nobody types one.
 */
function NewFieldPage({
  existingKeys,
  onCreated,
}: {
  existingKeys: readonly string[];
  onCreated: (id: string) => void;
}) {
  const create = useCreateCustomField();
  const run = useToastedRun();
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [choices, setChoices] = useState<string[]>([]);
  const [maxLength, setMaxLength] = useState("");
  const [visibility, setVisibility] =
    useState<CustomFieldVisibility>("chapter");
  const [required, setRequired] = useState(false);
  const [sensitive, setSensitive] = useState(false);

  const missing = !label.trim()
    ? MEMBER_FIELDS_COPY.needsName
    : type === "select" && choices.length === 0
      ? MEMBER_FIELDS_COPY.needsOption
      : type === "text" &&
          maxLength !== "" &&
          parseGuardedInt(maxLength, 1) === undefined
        ? MEMBER_FIELDS_COPY.maxLengthFloor
        : null;

  async function submit() {
    if (missing || create.isPending) return;
    const max = type === "text" ? parseGuardedInt(maxLength, 1) : undefined;
    let createdId: string | undefined;
    const ok = await run(
      async () => {
        const created = await create.mutateAsync({
          key: keyFromLabel(label, existingKeys, "field"),
          label: label.trim(),
          type,
          required,
          sensitive,
          visibility,
          ...(type === "select"
            ? { options: { choices } }
            : max !== undefined
              ? { options: { max_length: max } }
              : {}),
        });
        createdId = (created as { id?: string } | undefined)?.id;
      },
      "Couldn't add the field",
      "Check the name and try again.",
    );
    if (ok && createdId) onCreated(createdId);
  }

  return (
    <SettingsSubpage
      backHref={BASE}
      backLabel={MEMBER_FIELDS_COPY.pageTitle}
      title={MEMBER_FIELDS_COPY.addField}
      actions={
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={!!missing || create.isPending}
          title={missing ?? undefined}
        >
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          {missing ?? MEMBER_FIELDS_COPY.createField}
        </Button>
      }
    >
      <div className="grid max-w-md gap-1.5">
        <Label htmlFor="new-field-name">{MEMBER_FIELDS_COPY.name}</Label>
        <Input
          id="new-field-name"
          autoFocus
          value={label}
          maxLength={120}
          placeholder="Hometown"
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
        />
      </div>
      <SettingsGroup label={MEMBER_FIELDS_COPY.addField}>
        <SettingsRow
          icon={TYPE_ICON[type]}
          label={MEMBER_FIELDS_COPY.type}
          control={
            <Select
              value={type}
              onValueChange={(next) => {
                // What only the old type used goes, so it can't come back.
                setType(next as CustomFieldType);
                setChoices([]);
                setMaxLength("");
              }}
            >
              <SelectTrigger
                aria-label={MEMBER_FIELDS_COPY.type}
                className={SETTINGS_VALUE_TRIGGER}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {FIELD_TYPES.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {MEMBER_FIELD_TYPE_LABEL[entry]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        {type === "text" ? (
          <SettingsRow
            icon={Ruler}
            label={MEMBER_FIELDS_COPY.maxLength}
            control={
              <Input
                aria-label={MEMBER_FIELDS_COPY.maxLength}
                inputMode="numeric"
                value={maxLength}
                placeholder={MEMBER_FIELDS_COPY.noLimit}
                onChange={(event) => {
                  const next = guardIntDraft(event.target.value);
                  if (next !== undefined) setMaxLength(next);
                }}
                className="h-control-small w-28 text-right"
              />
            }
          />
        ) : null}
        <VisibilityRow
          value={visibility}
          disabled={false}
          onChange={setVisibility}
        />
        <SettingsRow
          label={MEMBER_FIELDS_COPY.required}
          checked={required}
          onCheckedChange={setRequired}
        />
        <SettingsRow
          label={MEMBER_FIELDS_COPY.sensitive}
          checked={sensitive}
          onCheckedChange={setSensitive}
        />
      </SettingsGroup>
      {type === "select" ? (
        <OptionsGroup
          choices={choices}
          disabled={false}
          keepOne={false}
          onChange={async (next) => {
            setChoices(next);
            return true;
          }}
        />
      ) : null}
    </SettingsSubpage>
  );
}
