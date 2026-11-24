"use client";

import type { DispatchChoice, DispatchChoices } from "@repo/chat-core/dispatch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * A slash command that named several things and ran nothing (`/rush vote
 * Jake Smith` with two Jake Smiths, `ifc-recruitment.md` § Name lookup) asks
 * which one, as Slack's and Discord's commands ask when an argument is
 * ambiguous. Each row is the name and what tells it apart; picking one runs
 * the same command for it by id. Closing runs nothing.
 */
export function SlashChoicePicker({
  choices,
  onPick,
  onClose,
}: {
  choices: DispatchChoices | null;
  onPick: (choice: DispatchChoice) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={choices !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{choices?.title ?? ""}</DialogTitle>
          <DialogDescription>Pick the one you meant.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {(choices?.options ?? []).map((choice) => (
            <li key={choice.args}>
              <button
                type="button"
                onClick={() => onPick(choice)}
                className="flex min-h-11 w-full flex-col items-start rounded-md px-3 py-2 text-left hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-sm font-medium text-foreground">
                  {choice.label}
                </span>
                <span className="text-caption text-muted-foreground">
                  {choice.detail}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
