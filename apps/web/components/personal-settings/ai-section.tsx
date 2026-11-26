"use client";

import { useState } from "react";
import {
  errorCopy,
  useAiChapterSettings,
  useAiConsent,
  useFrappAiChoice,
  usePermissionList,
} from "@repo/hooks";
import {
  AI_SETTINGS_COPY,
  FRAPP_AI_COPY,
  aiSwitchesInEffect,
  can,
} from "@repo/validation";
import { MeetFrappAiDialog } from "@/components/ai/meet-frapp-ai";
import { anyReadUncached } from "@/components/shared/async-states";
import { NestedError, NestedOffline } from "@/components/shared/nested-states";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { useNetwork } from "@/lib/providers/network-provider";
import { useToast } from "@/lib/hooks/use-toast";
import { PRIVACY_URL } from "@/lib/legal-links";

/** Chapter settings' AI page, where the president turns the chapter's AI on. */
const CHAPTER_AI_PATH = "/settings?tab=ai";

/**
 * Settings → Frapp Intelligence: the member's own switch, changed any time
 * (`spec/behavior/ai.md` § Consent). It sits in "My account" because the
 * answer is the person's, not a chapter's: one answer covers every chapter
 * they are in.
 *
 * Turning it on opens Meet Frapp Intelligence, so the yes is given where the companies
 * are named and the privacy policy is linked, as everywhere else. Turning it
 * off is immediate, and the server drops what was made from the member's
 * words (`onConsentWithdrawn`).
 *
 * The rail shows the row only while the server has AI (`useAiConsent`
 * answers `null` otherwise).
 *
 * An officer who can open Chapter settings also gets the Chapter AI row, how
 * many of the chapter's AI features are on, which opens that page; the
 * phone's Frapp Intelligence page draws the same row and footnote (#6032).
 */
export function AiSection() {
  const { isOffline } = useNetwork();
  const { toast } = useToast();
  const consentQuery = useAiConsent();
  const choice = useFrappAiChoice();
  const [meetOpen, setMeetOpen] = useState(false);
  const consent = consentQuery.data;
  const permissions = usePermissionList();
  const showChapterAi = !!consent && can("chapter-config:view", permissions);
  const chapterAi = useAiChapterSettings({ enabled: showChapterAi });

  if (isOffline && anyReadUncached(consentQuery)) {
    return (
      <NestedOffline
        sole
        title={FRAPP_AI_COPY.offlineTitle}
        description={FRAPP_AI_COPY.offlineDescription}
        onRetry={() => void consentQuery.refetch()}
      />
    );
  }
  if (consentQuery.isError && anyReadUncached(consentQuery)) {
    return (
      <NestedError
        sole
        title={FRAPP_AI_COPY.loadFailed}
        description={AI_SETTINGS_COPY.retryLater}
        onRetry={() => void consentQuery.refetch()}
      />
    );
  }
  // `null` is a server with no AI; the rail has no row for it, so a
  // hand-typed `?section=ai` lands on nothing rather than a dead switch.
  if (!consent) return null;

  async function turnOff() {
    try {
      await choice.notNow();
      toast({ title: FRAPP_AI_COPY.turnedOff });
    } catch (error) {
      toast({
        title: FRAPP_AI_COPY.turnOffFailed,
        description: errorCopy(error),
        variant: "destructive",
      });
    }
  }

  return (
    <section id="ai" className="scroll-mt-16">
      <SettingsGroup
        label={FRAPP_AI_COPY.settingsTitle}
        footnote={
          <>
            {FRAPP_AI_COPY.settingsFootnote}{" "}
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              {FRAPP_AI_COPY.privacyLink}
            </a>
            .
          </>
        }
      >
        <SettingsRow
          label={FRAPP_AI_COPY.settingsSwitch}
          description={FRAPP_AI_COPY.settingsCaption}
          checked={consent.answer === "yes"}
          disabled={isOffline || choice.pending}
          onCheckedChange={(next) => {
            if (next) setMeetOpen(true);
            else void turnOff();
          }}
        />
        {showChapterAi && chapterAi.data ? (
          <SettingsRow
            label={AI_SETTINGS_COPY.chapterRow}
            value={AI_SETTINGS_COPY.chapterRowValue(
              aiSwitchesInEffect(chapterAi.data),
            )}
            href={CHAPTER_AI_PATH}
          />
        ) : null}
      </SettingsGroup>
      <MeetFrappAiDialog
        open={meetOpen}
        onAnswered={(on) => {
          setMeetOpen(false);
          if (on) toast({ title: FRAPP_AI_COPY.turnedOn });
        }}
        onDismiss={() => setMeetOpen(false)}
      />
    </section>
  );
}
