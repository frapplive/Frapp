import { forwardRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
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
import { TypeSheet, TypeSheetEditPane } from "@/components/type-sheet";

/**
 * The Upload document sheet's Type (`spec/behavior/chapter-docs.md`
 * § Document types): the chapter's document types in the shared Type sheet,
 * as web's upload panel draws them in the Type menu (Paul 2026-11-22). A name
 * typed that the chapter doesn't have is held, and the upload adds it to the
 * list, so an abandoned upload adds nothing; for `chapter_docs:manage` it is
 * made at once, as web makes it. Rename and delete, from each row's pencil,
 * are for `chapter_docs:manage` too.
 */
export const DocumentTypeSheet = forwardRef<
  BottomSheetModal,
  {
    types: readonly DocumentTypeRow[];
    /** The held type's name; "" for none. */
    value: string;
    onChange: (name: string) => void;
    canManage: boolean;
  }
>(function DocumentTypeSheet({ types, value, onChange, canManage }, ref) {
  const createType = useCreateDocumentType();
  const key = documentTypeKey(value);
  const onList =
    value !== "" && types.some((type) => documentTypeKey(type.name) === key);
  return (
    <TypeSheet
      ref={ref}
      types={types}
      isHeld={(type) => value !== "" && documentTypeKey(type.name) === key}
      heldNewName={value !== "" && !onList ? value : null}
      onPick={(type) => onChange(type?.name ?? "")}
      toAdd={(typed) =>
        typeToAdd(typed, types, {
          max: DOCUMENT_TYPES_MAX,
          maxLength: DOCUMENT_TYPE_NAME_MAX_LENGTH,
          keyOf: documentTypeKey,
        })
      }
      onCreate={async (name) => {
        if (canManage) await createType.mutateAsync({ name });
        onChange(name);
      }}
      renderEditor={
        canManage
          ? (type, handle) => (
              <DocumentTypeEdit
                key={type.id}
                type={type}
                handle={handle}
                held={value === type.name}
                onRenamed={onChange}
              />
            )
          : undefined
      }
    />
  );
});

/** One document type's edit view: its name, and Delete type. */
function DocumentTypeEdit({
  type,
  handle,
  held,
  onRenamed,
}: {
  type: DocumentTypeRow;
  handle: TypeEditorHandle;
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
    <TypeSheetEditPane
      name={name}
      nameMaxLength={DOCUMENT_TYPE_NAME_MAX_LENGTH}
      onNameChange={(next) => {
        editor.clearError();
        setName(next);
      }}
      error={editor.error}
      saving={editor.saving}
      onLeave={editor.leave}
      deleteBody={DOCUMENT_TYPE_DELETE_CONSEQUENCE}
      deleting={editor.deleting}
      onDelete={editor.onDelete}
    />
  );
}
