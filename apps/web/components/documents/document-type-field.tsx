"use client";

import React, { useMemo, useState } from "react";
import {
  useCreateDocumentType,
  useDeleteDocumentType,
  useTypeEditor,
  useUpdateDocumentType,
  type DocumentTypeRow,
  type TypeEditorHandle,
} from "@repo/hooks";
import {
  DOCUMENT_TYPE_DELETE_CONSEQUENCE,
  DOCUMENT_TYPE_NAME_MAX_LENGTH,
  DOCUMENT_TYPES_MAX,
  documentTypeKey,
  tidyTypeName,
  TYPE_NAME_REQUIRED,
  typeToAdd,
} from "@repo/validation";
import { TypeEditPane, TypeMenu } from "@/components/shared/type-menu";
import { SelectFieldButton } from "@/components/ui/select";

/**
 * The upload panel's Type field (`spec/behavior/chapter-docs.md` § Document
 * types): the chapter's document types in the one Type menu
 * (`shared/type-menu.tsx`), as the event form's Type row draws them. It
 * replaced a row of chips, a "New type" chip and an "Edit types" popover
 * (Paul 2026-11-22: "yo what is this?").
 *
 * `Create “…”` makes the type at once for `chapter_docs:manage`
 * (`canManage`), as the event form makes an event type. For anyone else the
 * name is held, not made: the upload adds it to the list (the API registers
 * it, as it registers a new folder), so an uploader who can't manage types can
 * still add one by uploading, and one whose upload is abandoned adds nothing.
 * Rename and delete, from each row's edit button, are for `canManage`.
 */
export function DocumentTypeField({
  id,
  value,
  onChange,
  typeOptions,
  typeRows,
  canManage,
  disabled,
}: {
  id: string;
  /** The held type's name; "" for none. */
  value: string;
  /** `typed` is true for a name made with `Create “…”`, not picked from the list. */
  onChange: (name: string, typed?: boolean) => void;
  /** The names to offer when the chapter's list hasn't loaded. */
  typeOptions: readonly string[];
  /** The chapter's list; null until it loads, or when it can't be read. */
  typeRows: readonly DocumentTypeRow[] | null;
  canManage: boolean;
  disabled: boolean;
}) {
  // Until the list loads the menu offers the fallback names, keyed by name.
  const types = useMemo<readonly DocumentTypeRow[]>(
    () =>
      typeRows ??
      typeOptions.map(
        (name, index) =>
          ({ id: `name:${name}`, name, sort_order: index }) as DocumentTypeRow,
      ),
    [typeRows, typeOptions],
  );
  const createType = useCreateDocumentType();
  const key = documentTypeKey(value);
  const onList =
    value !== "" && types.some((t) => documentTypeKey(t.name) === key);
  const heldNewName = value !== "" && !onList ? value : null;

  return (
    <TypeMenu
      label="Document type"
      types={types}
      isHeld={(type) => value !== "" && documentTypeKey(type.name) === key}
      heldNewName={heldNewName}
      onPick={(type) => onChange(type?.name ?? "")}
      toAdd={(typed) =>
        typeToAdd(typed, types, {
          max: DOCUMENT_TYPES_MAX,
          maxLength: DOCUMENT_TYPE_NAME_MAX_LENGTH,
          keyOf: documentTypeKey,
        })
      }
      onCreate={async (name) => {
        if (canManage && typeRows) await createType.mutateAsync({ name });
        // Held as typed, so it isn't let go before the list refetches.
        onChange(name, true);
      }}
      renderEditor={
        canManage && typeRows
          ? (type, handle) => (
              <DocumentTypeEdit
                key={type.id}
                type={type}
                handle={handle}
                held={value === type.name}
                // Held as typed, so it isn't let go before the list refetches.
                onRenamed={(name) => onChange(name, name !== "")}
              />
            )
          : undefined
      }
      trigger={
        <SelectFieldButton
          id={id}
          disabled={disabled}
          placeholder={value === ""}
          aria-label={`Type: ${value || "none"}`}
        >
          {value || "No type"}
        </SelectFieldButton>
      }
    />
  );
}

/** One document type's edit view: its name, and Delete type. */
function DocumentTypeEdit({
  type,
  handle,
  held,
  onRenamed,
}: {
  type: DocumentTypeRow;
  handle: TypeEditorHandle;
  /** Whether the upload holds this type, so a rename follows it there. */
  held: boolean;
  onRenamed: (name: string) => void;
}) {
  const updateType = useUpdateDocumentType();
  const deleteType = useDeleteDocumentType();
  const [name, setName] = useState(type.name);
  const tidy = tidyTypeName(name);
  const editor = useTypeEditor({
    handle,
    changed: tidy !== type.name,
    save: async () => {
      if (documentTypeKey(tidy) === "") return TYPE_NAME_REQUIRED;
      await updateType.mutateAsync({ id: type.id, name: tidy });
      if (held) onRenamed(tidy);
      return null;
    },
    remove: async () => {
      await deleteType.mutateAsync(type.id);
      if (held) onRenamed("");
    },
  });
  return (
    <TypeEditPane
      id={`document-type-${type.id}`}
      name={name}
      nameMaxLength={DOCUMENT_TYPE_NAME_MAX_LENGTH}
      onNameChange={(next) => {
        editor.clearError();
        setName(next);
      }}
      error={editor.error}
      saving={editor.saving}
      onLeave={editor.leave}
      deleteConsequence={DOCUMENT_TYPE_DELETE_CONSEQUENCE}
      deletePending={editor.deleting}
      onDelete={editor.onDelete}
    />
  );
}
