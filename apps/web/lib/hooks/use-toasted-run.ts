import { useCallback } from "react";
import { useToast } from "@/lib/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";

/**
 * A settings write that says so only when it fails: runs `action`, and on a
 * refusal shows `failTitle` with the API's reason, or `fallback` when it gave
 * none. Resolves true once it went through, so a caller can follow up (close
 * the page, show "Saved"). Settings save on their own and say nothing when
 * they work (rulebook § 9), so success has no toast here.
 */
export function useToastedRun() {
  const { toast } = useToast();
  return useCallback(
    async (
      action: () => Promise<unknown>,
      failTitle: string,
      fallback: string,
    ): Promise<boolean> => {
      try {
        await action();
        return true;
      } catch (error) {
        toast({
          title: failTitle,
          description: getErrorMessage(error, fallback),
          variant: "destructive",
        });
        return false;
      }
    },
    [toast],
  );
}
