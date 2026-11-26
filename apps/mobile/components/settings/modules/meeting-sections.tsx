import { useState } from "react";
import { useMeetingTemplate, useSetMeetingTemplate } from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import {
  ALWAYS_MEETING_SECTIONS,
  MEETING_SECTION_HINTS,
  MEETING_SECTIONS,
  MEETING_SECTIONS_COPY,
  MODULE_ALWAYS_ON,
  ROLE_CANT_CHANGE_THESE,
  normalizeMeetingSections,
  type MeetingSectionKey,
} from "@repo/validation";
import {
  ListRow,
  ListRowSkeleton,
  ListSection,
  SectionHeader,
} from "@/components/list-section";
import { ListChecksGlyph } from "@/components/settings-glyphs";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { Toggle } from "@/components/toggle";
import { useFrappTheme } from "@/lib/theme";

/**
 * Meetings → Rules on the phone (#6030), web's `meeting-sections-rules.tsx`:
 * one row, "Sections in the minutes, 8 of 12", pushing the sections in
 * order. A section every minutes has says Always on rather than drawing a
 * switch that can't move; the rest switch, saved the moment they flip. A
 * section switched off keeps what earlier minutes wrote in it.
 */
export function MeetingSectionsRow({ onOpen }: { onOpen: () => void }) {
  const { tokens } = useFrappTheme();
  const templateQuery = useMeetingTemplate();
  const shown = templateQuery.data
    ? new Set(normalizeMeetingSections(templateQuery.data.sections)).size
    : null;
  return (
    <>
      <SectionHeader>Rules</SectionHeader>
      <ListSection>
        <ListRow
          leading={
            <ListChecksGlyph color={tokens.color.text.mutedForeground} />
          }
          label={MEETING_SECTIONS_COPY.title}
          value={
            shown === null
              ? templateQuery.isError
                ? "Couldn't load"
                : "Loading"
              : `${shown} of ${MEETING_SECTIONS.length}`
          }
          accessibilityHint="Opens the sections every meeting's minutes show."
          onPress={onOpen}
        />
      </ListSection>
    </>
  );
}

/** The sections' own screen. */
export function MeetingSectionsPage({ canManage }: { canManage: boolean }) {
  const templateQuery = useMeetingTemplate();
  const setTemplate = useSetMeetingTemplate();
  const [failed, setFailed] = useState<{
    key: MeetingSectionKey;
    message: string;
  } | null>(null);

  if (templateQuery.isError && !templateQuery.data) {
    return (
      <ErrorState
        title="Couldn't load the minutes sections"
        body="Check your connection and try again."
        onRetry={() => void templateQuery.refetch()}
        isRetrying={templateQuery.isFetching}
      />
    );
  }
  if (!templateQuery.data) {
    return (
      <SkeletonRegion label="Loading the minutes sections">
        <ListSection>
          {[0, 1, 2, 3, 4].map((index) => (
            <ListRowSkeleton key={index} index={index} description />
          ))}
        </ListSection>
      </SkeletonRegion>
    );
  }
  const on = new Set(normalizeMeetingSections(templateQuery.data.sections));

  function toggle(key: MeetingSectionKey, next: boolean) {
    setFailed(null);
    const sections = MEETING_SECTIONS.map((section) => section.key).filter(
      (sectionKey) => (sectionKey === key ? next : on.has(sectionKey)),
    );
    setTemplate.mutateAsync(sections).catch((error: unknown) =>
      setFailed({
        key,
        message: `${MEETING_SECTIONS_COPY.failed}. ${errorCopy(error, "Try again in a moment.")}`,
      }),
    );
  }

  const footnote = canManage
    ? MEETING_SECTIONS_COPY.footnote
    : `${MEETING_SECTIONS_COPY.footnote} ${ROLE_CANT_CHANGE_THESE}`;

  return (
    <ListSection footnote={footnote}>
      {MEETING_SECTIONS.map((section) => {
        const failure = failed?.key === section.key ? failed.message : null;
        const hint = MEETING_SECTION_HINTS[section.key];
        return ALWAYS_MEETING_SECTIONS.includes(section.key) ? (
          <ListRow
            key={section.key}
            label={section.label}
            description={hint}
            value={MODULE_ALWAYS_ON}
          />
        ) : (
          <ListRow
            key={section.key}
            label={section.label}
            description={failure ?? hint}
            descriptionTone={failure ? "destructive" : "default"}
            trailing={
              <Toggle
                value={on.has(section.key)}
                disabled={!canManage || setTemplate.isPending}
                onValueChange={(next) => toggle(section.key, next)}
                accessibilityLabel={section.label}
              />
            }
          />
        );
      })}
    </ListSection>
  );
}
