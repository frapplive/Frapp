"use client";

import { useId, useState } from "react";
import { statusOf } from "@repo/api-sdk";
import { useAddRushProspect } from "@repo/hooks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/utils";

/** `CreateRushCandidateDto.display_name`'s cap. */
const PROSPECT_NAME_MAX = 200;

/**
 * The New prospect form: one name, in a centred dialog, as a short question
 * is (rulebook § 9). A name the chapter already has (409) is said under the
 * field, so the member can change it without starting over.
 */
export function AddProspectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const add = useAddRushProspect();
  const nameId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const trimmed = name.trim();

  async function submit() {
    if (!trimmed || add.isPending) return;
    setProblem(null);
    try {
      await add.mutateAsync(trimmed);
      setName("");
      onOpenChange(false);
    } catch (error) {
      setProblem(
        statusOf(error) === 409
          ? `${trimmed} is already on the list. Add something to tell them apart, like a last initial.`
          : getErrorMessage(error, "Couldn't add them. Retry in a moment."),
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && add.isPending) return;
        // Closing keeps what was typed (rulebook § 4): the next open shows it.
        setProblem(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>New prospect</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              autoFocus
              maxLength={PROSPECT_NAME_MAX}
              autoComplete="off"
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? errorId : undefined}
              onChange={(event) => {
                setName(event.target.value);
                if (problem) setProblem(null);
              }}
            />
            {problem ? (
              <p
                id={errorId}
                role="alert"
                className="text-sm text-destructive-text"
              >
                {problem}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="submit"
              size="sm"
              disabled={!trimmed || add.isPending}
              title={trimmed ? undefined : "Add a name first"}
            >
              Add prospect
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
