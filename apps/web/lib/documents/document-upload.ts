import { putSignedUpload } from "@repo/hooks";
import {
  MAX_UPLOAD_LABEL,
  inspectUploadFile,
  readSignedUpload,
} from "@repo/validation";
import { ZIP_REFUSAL } from "@/lib/documents/folder-import";

/*
  The signed-URL flow blocks SVG + executables. Kind `document` in
  `@repo/validation` is shared with Backwork and chat so the three cannot drift.

  Each string names the verdict, because it can be the whole inline error under
  the file field rather than a toast body under a title that named it.
*/
export function uploadRejectionDescription(
  reason: "type" | "size",
  filename: string,
): string {
  if (reason === "size") {
    return `That file is too large. Chapter documents accept files up to ${MAX_UPLOAD_LABEL}.`;
  }
  // A zipped folder is a way forward, not a dead end (#5331): Import a folder
  // takes the folder once it's unzipped.
  if (/\.zip$/i.test(filename)) {
    return ZIP_REFUSAL;
  }
  return "That file type is not allowed. Chapter documents accept PDFs, Office files, text, CSV, and common images (no SVG).";
}

/**
 * A chapter document's file, checked against the shared allowlist before any
 * link is asked for: its content type, or the words that refuse it.
 */
export function inspectDocumentFile(
  file: File,
): { ok: true; contentType: string } | { ok: false; description: string } {
  const inspected = inspectUploadFile("document", file);
  if (!inspected.ok) {
    return {
      ok: false,
      description: uploadRejectionDescription(inspected.reason, file.name),
    };
  }
  return { ok: true, contentType: inspected.contentType };
}

/**
 * The bytes step every document upload shares (a new file, #3642, and a new
 * version, #6055): ask for a signed link with `requestTicket`, PUT the file
 * to it, and answer with the storage path the caller's confirm sends. The
 * confirm itself differs, so it stays with the caller.
 */
export async function putDocumentFile(
  file: File,
  contentType: string,
  requestTicket: () => Promise<unknown>,
): Promise<string> {
  const { signedUrl, storagePath } = readSignedUpload(await requestTicket());
  await putSignedUpload({
    signedUrl,
    body: file,
    contentType,
    upsert: true,
    describeRejection: () =>
      "The file didn't upload. Check its size and try again.",
  });
  return storagePath;
}
