"use client";

import {
  type AiChapterSettings,
  errorCopy,
  useAiChapterSettings,
  useAskStatus,
  useUpdateAiChapterSettings,
} from "@repo/hooks";
import {
  AI_SETTINGS_COPY,
  AI_SWITCHES,
  aiSettingsFootnote,
  aiSwitchState,
  formatAiAnswerDate,
  type AiSwitchCopy,
} from "@repo/validation";
import { AskDiagnosticsGroup } from "@/components/settings/ask-diagnostics-group";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { anyReadUncached } from "@/components/shared/async-states";
import { NestedError, NestedOffline } from "@/components/shared/nested-states";
import { useNetwork } from "@/lib/providers/network-provider";
import { useToast } from "@/lib/hooks/use-toast";

/**
 * Chapter settings → AI (#4308, `spec/behavior/ai.md` § Consent, gate 1):
 * the president's switch for each AI feature family, as settings rows (#6028):
 * one line each, the phone's AI screen's words, and what every switch shares
 * in the footnote, as iOS Settings' Apple Intelligence page draws them. No
 * title block: the rail names the page, as on Semester and Privacy. No
 * company names (Paul, 2026-11-17): they are on Meet Frapp Intelligence and
 * in the privacy policy.
 *
 * The rail shows this row only while the server has AI
 * (`useAiConsent` answers `null` otherwise), so with `AI_ENABLED` off Chapter
 * settings is exactly what it was.
 *
 * Every officer who opens Chapter settings sees the switches, so a vice
 * president can tell a member why a feature is missing; only the president
 * changes them (`can_change`; the PATCH checks again and audits each change
 * to `#chapter-audit`). Slack's and Notion's workspace AI settings follow
 * the same split: one owner switch per feature, visible to admins.
 *
 * "Include channel messages" only changes what Ask reads, so it sits nested
 * under Questions and requests and waits for it, the way iOS draws a dependent switch.
 * The server stores it either way; the page just won't let a president turn
 * on something that does nothing yet, and still lets them turn it off.
 */
export function SettingsAiTab() {
  const { isOffline } = useNetwork();
  const settingsQuery = useAiChapterSettings();
  const update = useUpdateAiChapterSettings();
  // Diagnostics draws only for the one chapter the server offers it to; with
  // it the switches take a heading, so the page reads as two groups.
  const diagnosticsOffered = useAskStatus().data?.diagnostics?.offered === true;
  const { toast } = useToast();

  const settings = settingsQuery.data;

  async function toggle(entry: AiSwitchCopy, next: boolean) {
    try {
      await update.mutateAsync({ [entry.key]: next });
      toast({
        title: next
          ? AI_SETTINGS_COPY.turnedOn(entry.label)
          : AI_SETTINGS_COPY.turnedOff(entry.label),
      });
    } catch (error) {
      toast({
        title: AI_SETTINGS_COPY.saveFailed,
        description: errorCopy(error),
        variant: "destructive",
      });
    }
  }

  let body: React.ReactNode;
  if (isOffline && anyReadUncached(settingsQuery)) {
    body = (
      <NestedOffline
        title={AI_SETTINGS_COPY.offlineTitle}
        description={AI_SETTINGS_COPY.offlineDescription}
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  } else if (settingsQuery.isError && anyReadUncached(settingsQuery)) {
    body = (
      <NestedError
        title={AI_SETTINGS_COPY.loadFailed}
        description={AI_SETTINGS_COPY.retryLater}
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  } else {
    const footnote = settings
      ? aiSettingsFootnote(
          settings.can_change,
          settings.updated_at ? formatAiAnswerDate(settings.updated_at) : null,
        )
      : null;
    body = (
      <SettingsGroup
        label={AI_SETTINGS_COPY.title}
        heading={
          diagnosticsOffered ? AI_SETTINGS_COPY.featuresHeading : undefined
        }
        footnote={footnote}
      >
        <AiSwitchRows
          settings={settings ?? null}
          // Every switch waits while one saves: each answer replaces the
          // whole cached row, so two saves in flight could leave one drawn
          // wrong.
          disabled={isOffline || update.isPending}
          onToggle={(entry, next) => void toggle(entry, next)}
        />
      </SettingsGroup>
    );
  }

  return (
    <div className="space-y-8">
      {body}
      <AskDiagnosticsGroup />
    </div>
  );
}

/**
 * The chapter's switches. Before the read lands they draw off and disabled at
 * their full height, so nothing moves when it does; a read can't be in
 * flight long, since this page only shows once the server answered.
 */
function AiSwitchRows({
  settings,
  disabled,
  onToggle,
}: {
  settings: AiChapterSettings | null;
  disabled?: boolean;
  onToggle: (entry: AiSwitchCopy, next: boolean) => void;
}) {
  const canChange = settings?.can_change === true;
  return (
    <>
      {AI_SWITCHES.map((entry) => {
        const { checked, parentOff, waitsOnParent } = aiSwitchState(
          entry,
          settings,
        );
        return (
          <SettingsRow
            key={entry.key}
            id={`settings-ai-${entry.key}`}
            label={entry.label}
            description={
              waitsOnParent
                ? `${entry.short} ${AI_SETTINGS_COPY.dependsOnAsk}`
                : entry.short
            }
            checked={checked}
            nested={entry.dependsOn !== undefined}
            muted={parentOff}
            disabled={
              !canChange ||
              disabled === true ||
              // Waiting on its parent blocks turning it on, never off: a
              // president who turned Ask off can still clear what it reads.
              waitsOnParent
            }
            onCheckedChange={(next) => onToggle(entry, next)}
          />
        );
      })}
    </>
  );
}
