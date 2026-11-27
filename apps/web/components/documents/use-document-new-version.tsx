"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  useReplaceDocumentFile,
  useRequestDocumentVersionUploadUrl,
} from "@repo/hooks";
import { acceptAttribute } from "@repo/validation";
import {
  inspectDocumentFile,
  putDocumentFile,
} from "@/lib/documents/document-upload";
import { useToast } from "@/lib/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";

/**
 * Upload a new version of one file (#6055), as Google Drive's and Dropbox's
 * "Upload new version" do: the system file picker opens at once, and the
 * file it returns takes the old one's place on the same document, which
 * keeps its name, folder, who can see it, pin, stars and links. No panel:
 * there is nothing to fill in.
 *
 * The same three steps and checks as an upload (`useDocumentUpload`), shared
 * through `lib/documents/document-upload`: the allowlist first, then a
 * signed link and the bytes (`putDocumentFile`), and this route's confirm,
 * which refreshes the library and the open viewer. A refusal or a failure
 * is a toast, since there is no field to put it under; `busy` spins the
 * control meanwhile.
 *
 * `input` is the hidden file input the picker opens from; render it once
 * wherever the control lives.
 */
export function useDocumentNewVersion(doc: { id: string; title: string }): {
  choose: () => void;
  busy: boolean;
  input: ReactNode;
} {
  const { toast } = useToast();
  const requestUpload = useRequestDocumentVersionUploadUrl();
  const replaceFile = useReplaceDocumentFile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    const inspected = inspectDocumentFile(file);
    if (!inspected.ok) {
      toast({
        title: "Couldn't upload a new version",
        description: inspected.description,
        variant: "destructive",
      });
      return;
    }
    const contentType = inspected.contentType;
    setBusy(true);
    try {
      const storagePath = await putDocumentFile(file, contentType, () =>
        requestUpload.mutateAsync({
          id: doc.id,
          filename: file.name,
          content_type: contentType,
          size_bytes: file.size,
        }),
      );
      await replaceFile.mutateAsync({
        id: doc.id,
        storage_path: storagePath,
        content_type: contentType,
        byte_size: file.size,
      });
      toast({
        title: "New version uploaded",
        description: `${doc.title} is now ${file.name}.`,
      });
    } catch (error) {
      toast({
        title: "Couldn't upload a new version",
        description: getErrorMessage(error, "Try the upload again."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      hidden
      tabIndex={-1}
      aria-hidden
      accept={acceptAttribute("document")}
      data-testid={`new-version-input-${doc.id}`}
      onChange={(event) => {
        const file = event.target.files?.[0];
        // Cleared, so picking the same file again still fires a change.
        event.target.value = "";
        if (file) void upload(file);
      }}
    />
  );

  return {
    choose: () => {
      if (!busy) inputRef.current?.click();
    },
    busy,
    input,
  };
}
