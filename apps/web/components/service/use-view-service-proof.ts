"use client";

import { useGetServiceProofUrl } from "@repo/hooks";
import { useToast } from "@/lib/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";

/**
 * Open a service entry's proof in a new tab, through a link signed at that
 * moment (`GET /v1/service-entries/:id/proof-url`). One flow for every place
 * an approver reads proof: Activity's review and the chapter's service
 * history. It is a read, so it stays available to a chapter whose plan
 * blocks writes.
 */
export function useViewServiceProof() {
  const { toast } = useToast();
  const getProofUrl = useGetServiceProofUrl();

  async function viewProof(entryId: string) {
    try {
      const data = await getProofUrl.mutateAsync(entryId);
      const url =
        data && typeof data === "object" && "url" in data
          ? (data as { url?: string }).url
          : null;
      if (!url) throw new Error("No download URL returned.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast({
        title: "Couldn't open proof",
        description: getErrorMessage(
          error,
          "Older entries may reference proof that was never uploaded.",
        ),
        variant: "destructive",
      });
    }
  }

  return { viewProof, isPending: getProofUrl.isPending };
}
