"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  useCreateRushTag,
  useDeleteRushTag,
  useRenameRushTag,
  type RushTag,
} from "@repo/hooks";
import { RUSH_TAGS_MAX, RUSH_TAG_LABEL_MAX } from "@repo/validation";
import { ProfileSection } from "@/components/profile/profile-section";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { InlineNote } from "@/components/shared/inline-note";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { InlineNameField } from "@/components/settings/inline-name-field";
import { Badge } from "@/components/ui/badge";
import { toastFailure } from "@/lib/failure-toast";

/**
 * The chapter's own recruitment tags ("legacy", "athlete", "met at
 * tabling"), on the Recruitment module page. With `rush:manage` each is
 * renamed in place (Enter or leaving the field saves, Escape puts it back),
 * deleted after a confirm, since that takes it off every prospect, and a new
 * one is added at the foot. Everyone else reads the list as chips.
 */
export function RushTagList({
  tags,
  canEdit,
}: {
  tags: readonly RushTag[];
  canEdit: boolean;
}) {
  const create = useCreateRushTag();
  const rename = useRenameRushTag();
  const remove = useDeleteRushTag();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [adding, setAdding] = useState(false);
  const sorted = [...tags].sort((a, b) => a.label.localeCompare(b.label));
  const full = tags.length >= RUSH_TAGS_MAX;

  async function add(label: string) {
    setAdding(false);
    try {
      await create.mutateAsync(label);
    } catch (error) {
      toastFailure({
        title: `Couldn't add ${label}`,
        error,
        fallback: "Retry in a moment.",
      });
    }
  }

  async function del(tag: RushTag) {
    const ok = await confirm({
      title: `Delete ${tag.label}?`,
      description: "It comes off every prospect tagged with it.",
      confirmLabel: "Delete tag",
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(tag.id);
    } catch (error) {
      toastFailure({
        title: `Couldn't delete ${tag.label}`,
        error,
        fallback: "Retry in a moment.",
      });
    }
  }

  return (
    <ProfileSection
      id="settings-module-rush-tags"
      title="Tags"
      hint="Labels members put on prospects."
    >
      {confirmDialog}
      {!canEdit ? (
        sorted.length === 0 ? (
          <InlineNote>No tags yet.</InlineNote>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {sorted.map((tag) => (
              <Badge key={tag.id} variant="outline" className="text-foreground">
                {tag.label}
              </Badge>
            ))}
          </div>
        )
      ) : (
        <div className="grid gap-2">
          {sorted.length > 0 || adding ? (
            <ul className="divide-y divide-border rounded-[14px] border border-border bg-card">
              {sorted.map((tag) => (
                <li
                  key={tag.id}
                  className="flex min-h-11 items-center gap-2 px-3 py-1.5"
                >
                  <InlineNameField
                    maxLength={RUSH_TAG_LABEL_MAX}
                    key={`${tag.id}:${tag.label}`}
                    label={tag.label}
                    onCommit={(label) =>
                      rename.mutate(
                        { tagId: tag.id, label },
                        {
                          onError: (error) =>
                            toastFailure({
                              title: `Couldn't rename ${tag.label}`,
                              error,
                              fallback: "Retry in a moment.",
                            }),
                        },
                      )
                    }
                  />
                  <IconButton
                    label={`Delete ${tag.label}`}
                    className="shrink-0 text-muted-foreground"
                    onClick={() => void del(tag)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                </li>
              ))}
              {adding ? (
                <li className="flex min-h-11 items-center gap-2 px-3 py-1.5">
                  <InlineNameField
                    maxLength={RUSH_TAG_LABEL_MAX}
                    label=""
                    autoFocus
                    placeholder="New tag"
                    onCommit={(label) => void add(label)}
                    onCancel={() => setAdding(false)}
                  />
                </li>
              ) : null}
            </ul>
          ) : null}
          {adding ? null : (
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                disabled={full}
                title={
                  full
                    ? `A chapter can have up to ${RUSH_TAGS_MAX} tags.`
                    : undefined
                }
                onClick={() => setAdding(true)}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add a tag
              </Button>
            </div>
          )}
        </div>
      )}
    </ProfileSection>
  );
}
