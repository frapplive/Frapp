import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  rushPipelineAccess,
  useCreateRushTag,
  useDeleteRushTag,
  usePermissionList,
  useRenameRushTag,
  useRushPipeline,
  type RushTag,
} from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import {
  RUSH_SETTINGS_COPY,
  RUSH_TAG_LABEL_MAX,
  RUSH_TAGS_MAX,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { PlusGlyph, TrashGlyph } from "@/components/control-glyphs";
import { IconButton } from "@/components/icon-button";
import { InlineNote } from "@/components/inline-note";
import {
  ListRow,
  ListRowSkeleton,
  ListSection,
} from "@/components/list-section";
import { FormHint } from "@/components/settings/chapter-form";
import { NameField } from "@/components/settings/modules/rush-stages-page";
import { SkeletonRegion } from "@/components/state-block";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import { typeRole, useFrappTheme } from "@/lib/theme";

const COPY = RUSH_SETTINGS_COPY.tags;

/**
 * Recruitment → Tags on the phone (#6030), web's `RushTagList`: the
 * chapter's own labels for prospects ("legacy", "met at tabling"). With
 * `rush:manage` each is renamed in place (Done or leaving the field saves),
 * deleted after a confirm, since that takes it off every prospect, and a new
 * one is added at the foot. Everyone else reads the list.
 */
export function RushTagsPage() {
  const access = rushPipelineAccess(usePermissionList());
  const pipeline = useRushPipeline({ enabled: access.view });
  if (pipeline.isError && !pipeline.data) {
    return <InlineNote tone="warning">{COPY.loadFailed}</InlineNote>;
  }
  if (!pipeline.data) {
    return (
      <SkeletonRegion label="Loading the tags">
        <ListSection>
          {[0, 1, 2].map((index) => (
            <ListRowSkeleton key={index} index={index} />
          ))}
        </ListSection>
      </SkeletonRegion>
    );
  }
  return <TagList tags={pipeline.data.tags} canEdit={access.manage} />;
}

function TagList({
  tags,
  canEdit,
}: {
  tags: readonly RushTag[];
  canEdit: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const create = useCreateRushTag();
  const rename = useRenameRushTag();
  const remove = useDeleteRushTag();
  const [adding, setAdding] = useState(false);
  // The tag whose last change failed, and why, on its row (no toast here).
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(
    null,
  );
  const sorted = [...tags].sort((a, b) => a.label.localeCompare(b.label));
  const full = tags.length >= RUSH_TAGS_MAX;
  const muted = tokens.color.text.mutedForeground;

  async function del(tag: RushTag) {
    const ok = await confirmAlert({
      title: COPY.deleteTitle(tag.label),
      body: COPY.deleteBody,
      confirmLabel: COPY.deleteAction,
      destructive: true,
    });
    if (!ok) return;
    setFailed(null);
    remove.mutate(tag.id, {
      onError: (error) =>
        setFailed({
          id: tag.id,
          message: `Couldn't delete ${tag.label}. ${errorCopy(error, "Retry in a moment.")}`,
        }),
    });
  }

  if (!canEdit) {
    return (
      <>
        <FormHint>{COPY.hint}</FormHint>
        {sorted.length === 0 ? (
          <InlineNote>{COPY.none}</InlineNote>
        ) : (
          <ListSection>
            {sorted.map((tag) => (
              <ListRow key={tag.id} label={tag.label} />
            ))}
          </ListSection>
        )}
      </>
    );
  }

  return (
    <>
      <FormHint>{COPY.hint}</FormHint>
      <ListSection
        footnote={
          failed?.id === "new"
            ? failed.message
            : full
              ? COPY.full(RUSH_TAGS_MAX)
              : null
        }
      >
        {sorted.map((tag) => (
          <View key={tag.id}>
            <View style={styles.row}>
              <NameField
                key={`${tag.id}:${tag.label}`}
                label={tag.label}
                maxLength={RUSH_TAG_LABEL_MAX}
                onCommit={(label) => {
                  setFailed(null);
                  rename.mutate(
                    { tagId: tag.id, label },
                    {
                      onError: (error) =>
                        setFailed({
                          id: tag.id,
                          message: `Couldn't rename ${tag.label}. ${errorCopy(error, "Retry in a moment.")}`,
                        }),
                    },
                  );
                }}
              />
              <IconButton
                label={`Delete ${tag.label}`}
                onPress={() => void del(tag)}
              >
                <TrashGlyph color={muted} size={18} />
              </IconButton>
            </View>
            {failed?.id === tag.id ? (
              <Text accessibilityLiveRegion="polite" style={styles.failed}>
                {failed.message}
              </Text>
            ) : null}
          </View>
        ))}
        {adding ? (
          <View style={styles.row}>
            <NameField
              label=""
              autoFocus
              placeholder={COPY.newTag}
              maxLength={RUSH_TAG_LABEL_MAX}
              onCommit={(label) => {
                setAdding(false);
                setFailed(null);
                create.mutate(label, {
                  onError: (error) =>
                    setFailed({
                      id: "new",
                      message: `Couldn't add ${label}. ${errorCopy(error, "Retry in a moment.")}`,
                    }),
                });
              }}
              onCancel={() => setAdding(false)}
            />
          </View>
        ) : full ? null : (
          <ListRow
            label={COPY.add}
            leading={<PlusGlyph color={muted} />}
            accessibilityHint="Adds a tag members can put on prospects."
            onPress={() => setAdding(true)}
          />
        )}
      </ListSection>
    </>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.sm,
      minHeight: tokens.touch.minimum,
    },
    failed: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructiveText,
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.sm,
    },
  });
}
