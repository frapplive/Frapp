"use client";

import { useMeetingTemplate, useSetMeetingTemplate } from "@repo/hooks";
import {
  ALWAYS_MEETING_SECTIONS,
  MEETING_SECTION_HINTS,
  MEETING_SECTIONS,
  MEETING_SECTIONS_COPY,
  MODULE_ALWAYS_ON,
  normalizeMeetingSections,
  type MeetingSectionKey,
} from "@repo/validation";
import { ListChecks } from "lucide-react";
import { SwitchRule } from "@/components/settings/module-rules";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { ErrorState } from "@/components/shared/async-states";
import { SkeletonText } from "@/components/shared/async-states";
import { useToast } from "@/lib/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";

/**
 * Meetings → Rules: the sections the chapter's minutes show
 * (`spec/behavior/meetings.md` § The template). A switch saves when it
 * flips, like Privacy's. A section switched off keeps what minutes already
 * wrote in it, and those minutes still show it.
 */
export function MeetingSectionsRules({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const templateQuery = useMeetingTemplate();
  const setTemplate = useSetMeetingTemplate();

  if (templateQuery.isPending) return <SkeletonText lines={4} />;
  if (!templateQuery.data) {
    return (
      <ErrorState
        title="Couldn't load the minutes sections"
        onRetry={() => void templateQuery.refetch()}
      />
    );
  }
  const on = new Set(normalizeMeetingSections(templateQuery.data.sections));

  async function toggle(key: MeetingSectionKey, next: boolean) {
    const sections = MEETING_SECTIONS.map((section) => section.key).filter(
      (sectionKey) => (sectionKey === key ? next : on.has(sectionKey)),
    );
    try {
      await setTemplate.mutateAsync(sections);
    } catch (error) {
      toast({
        title: MEETING_SECTIONS_COPY.failed,
        description: getErrorMessage(error, "Try again in a moment."),
        variant: "destructive",
      });
    }
  }

  return (
    <section
      id="settings-module-meetings-rules"
      aria-label={MEETING_SECTIONS_COPY.title}
      className="scroll-mt-16"
    >
      <SettingsGroup
        label={MEETING_SECTIONS_COPY.title}
        footnote={MEETING_SECTIONS_COPY.footnote}
      >
        {MEETING_SECTIONS.map((section) =>
          ALWAYS_MEETING_SECTIONS.includes(section.key) ? (
            // Always in the minutes: said as the row's value rather than
            // drawn as a switch nobody can move.
            <SettingsRow
              key={section.key}
              label={section.label}
              description={MEETING_SECTION_HINTS[section.key]}
              control={
                <span className="text-sm text-muted-foreground">
                  {MODULE_ALWAYS_ON}
                </span>
              }
            />
          ) : (
            <SwitchRule
              asItem
              key={section.key}
              label={section.label}
              hint={MEETING_SECTION_HINTS[section.key]}
              checked={on.has(section.key)}
              disabled={!canManage || setTemplate.isPending}
              onChange={(next) => void toggle(section.key, next)}
            />
          ),
        )}
      </SettingsGroup>
    </section>
  );
}

/**
 * Meetings → Rules' row (#6030): how many sections the minutes show, opening
 * the page with the sections themselves.
 */
export function MeetingSectionsRow({ href }: { href: string }) {
  const templateQuery = useMeetingTemplate();
  const shown = templateQuery.data
    ? new Set(normalizeMeetingSections(templateQuery.data.sections)).size
    : null;
  return (
    <SettingsRow
      id="module-row-sections"
      icon={ListChecks}
      label={MEETING_SECTIONS_COPY.title}
      value={
        shown === null
          ? templateQuery.isError
            ? "Couldn't load"
            : "Loading"
          : `${shown} of ${MEETING_SECTIONS.length}`
      }
      href={href}
    />
  );
}
