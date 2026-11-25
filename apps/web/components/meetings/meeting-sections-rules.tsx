"use client";

import { useMeetingTemplate, useSetMeetingTemplate } from "@repo/hooks";
import {
  ALWAYS_MEETING_SECTIONS,
  MEETING_SECTIONS,
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

/** What each section holds, under its switch. */
const SECTION_HINTS: Readonly<Record<MeetingSectionKey, string>> = {
  tldr: "Two or three short lines for every member: the gist of the meeting.",
  attendees:
    "Who checked in to the meeting's event: present, late and excused.",
  summary: "A few paragraphs on what the meeting covered.",
  announcements: "What officers announced.",
  dates:
    "The days the meeting named, as calendar tiles: installation, a deadline, the next formal.",
  decisions:
    "Motions and what was decided, with the vote count when one was taken.",
  action_items: "What needs doing, who it's on, and when it's due.",
  tabled:
    "What the meeting put off to a later meeting, with the date it was first tabled.",
  officer_reports: "Each officer's report.",
  old_business: "Items carried over from earlier meetings.",
  new_business: "Items raised for the first time.",
  discussion_log:
    "Every topic the meeting covered, with what was said about it.",
};

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
        title: "Couldn't change the sections",
        description: getErrorMessage(error, "Try again in a moment."),
        variant: "destructive",
      });
    }
  }

  return (
    <section
      id="settings-module-meetings-rules"
      aria-label="Sections in the minutes"
      className="scroll-mt-16"
    >
      <SettingsGroup
        label="Sections in the minutes"
        footnote="Every meeting's minutes show these, in this order. A section switched off keeps what earlier minutes wrote in it."
      >
        {MEETING_SECTIONS.map((section) =>
          ALWAYS_MEETING_SECTIONS.includes(section.key) ? (
            // Always in the minutes: said as the row's value rather than
            // drawn as a switch nobody can move.
            <SettingsRow
              key={section.key}
              label={section.label}
              description={SECTION_HINTS[section.key]}
              control={
                <span className="text-sm text-muted-foreground">Always on</span>
              }
            />
          ) : (
            <SwitchRule
              asItem
              key={section.key}
              label={section.label}
              hint={SECTION_HINTS[section.key]}
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
      label="Sections in the minutes"
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
