"use client";

import { errorCopy, useAskStatus, useSetAskDiagnostics } from "@repo/hooks";
import {
  ASK_DIAGNOSTICS_COPY,
  ASK_DIAGNOSTICS_DAYS,
  formatAiAnswerDate,
} from "@repo/validation";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/hooks/use-toast";
import { useNetwork } from "@/lib/providers/network-provider";

/**
 * Chapter settings → AI's Diagnostics group: the beta diagnostics window on Ask
 * (`spec/behavior/ai.md` § Stored AI text, ADR-28 decision 8, #4315).
 *
 * Drawn only for the one chapter the server offers the window to
 * (`diagnostics.offered`), so every other chapter's AI page is what it was.
 * The president starts it through a confirmation that names the end date and
 * what members will see, because the yes is recorded in the audit log and
 * cannot be extended; anyone else who opens the page reads whether it is on.
 * Stopping deletes what was kept, so it confirms as a destructive action.
 *
 * It is a button with its state in words rather than a switch: a switch says
 * "on until I turn it off", and this turns itself off on a date.
 */
export function AskDiagnosticsGroup() {
  const status = useAskStatus();
  const change = useSetAskDiagnostics();
  const { confirm, confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const { isOffline } = useNetwork();

  const diagnostics = status.data?.diagnostics;
  if (!diagnostics?.offered) return null;
  const endsAt = diagnostics.ends_at;

  async function set(on: boolean) {
    const answer = await confirm(
      on
        ? {
            title: ASK_DIAGNOSTICS_COPY.confirmStartTitle,
            description: ASK_DIAGNOSTICS_COPY.confirmStartBody(
              formatAiAnswerDate(
                new Date(
                  Date.now() + ASK_DIAGNOSTICS_DAYS * 24 * 60 * 60 * 1000,
                ).toISOString(),
              ),
            ),
            confirmLabel: ASK_DIAGNOSTICS_COPY.confirmStart,
            cancelLabel: ASK_DIAGNOSTICS_COPY.cancel,
          }
        : {
            title: ASK_DIAGNOSTICS_COPY.confirmStopTitle,
            description: ASK_DIAGNOSTICS_COPY.confirmStopBody,
            confirmLabel: ASK_DIAGNOSTICS_COPY.confirmStop,
            cancelLabel: ASK_DIAGNOSTICS_COPY.cancel,
            tone: "destructive",
          },
    );
    if (!answer) return;
    try {
      await change.mutateAsync(on);
      toast({
        title: on ? ASK_DIAGNOSTICS_COPY.started : ASK_DIAGNOSTICS_COPY.stopped,
      });
    } catch (error) {
      toast({
        title: ASK_DIAGNOSTICS_COPY.failed,
        description: errorCopy(error),
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <SettingsGroup
        heading={ASK_DIAGNOSTICS_COPY.heading}
        footnote={
          diagnostics.can_change
            ? ASK_DIAGNOSTICS_COPY.footnote
            : `${ASK_DIAGNOSTICS_COPY.presidentOnly} ${ASK_DIAGNOSTICS_COPY.footnote}`
        }
      >
        <SettingsRow
          id="settings-ask-diagnostics"
          label={ASK_DIAGNOSTICS_COPY.label}
          description={
            endsAt
              ? ASK_DIAGNOSTICS_COPY.on(formatAiAnswerDate(endsAt))
              : ASK_DIAGNOSTICS_COPY.off
          }
          control={
            diagnostics.can_change ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isOffline || change.isPending}
                onClick={() => void set(endsAt === null)}
              >
                {endsAt ? ASK_DIAGNOSTICS_COPY.stop : ASK_DIAGNOSTICS_COPY.start}
              </Button>
            ) : null
          }
        />
      </SettingsGroup>
      {confirmDialog}
    </>
  );
}
