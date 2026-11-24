"use client";

import { Plus } from "lucide-react";
import { useNewIntent } from "@/components/layout/new-intent";
import { NEW_ACTION_LABELS } from "@repo/validation";
import { Button } from "@/components/ui/button";
import {
  SubscriptionNotice,
  useGatedDialog,
  useSubscriptionGate,
} from "@/components/shared/subscription-gate";
import { LogHoursDialog } from "@/components/service/log-hours-dialog";
import { ServiceYours } from "@/components/service/service-yours";
import {
  serviceEntryMeta,
  useMyServiceLog,
} from "@/components/service/use-my-service-log";
import { StandingPanelFrame } from "./standing-panel-frame";

/**
 * Your service hours, opened from the Service hours figure on your own
 * Profile (#5950): approved hours this semester and all time with what is
 * pending beside them, then every entry you logged in every state, newest
 * first, with Withdraw on a pending one. Log hours is the panel's one action.
 *
 * It is the member half of the Service hours page that was a sidebar row.
 * Reviewing other members' hours is Activity's; the chapter's reviewed
 * entries are in Chapter settings (`spec/behavior/service-hours.md`).
 */
export function MyServicePanel({ onClose }: { onClose: () => void }) {
  // Every write on `ServiceEntryController` (proof-upload-url, create,
  // delete) carries no `@FreeTier`, so one gate covers the panel (#841).
  const gate = useSubscriptionGate();
  const logDialog = useGatedDialog(gate);
  const log = useMyServiceLog();
  // New's "Log hours" (`new-intent.ts`) opens this panel with the form open.
  useNewIntent(() => logDialog.setOpen(true), log.canLog && gate.allowed);

  return (
    <StandingPanelFrame
      title="Service hours"
      onClose={onClose}
      actions={
        log.canLog ? (
          <LogHoursDialog
            open={logDialog.open}
            onOpenChange={logDialog.setOpen}
            onCloseAutoFocus={logDialog.contentProps.onCloseAutoFocus}
            gate={gate}
            trigger={
              <Button
                size="toolbar"
                variant="action"
                className="gap-2"
                {...gate.controlProps()}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {NEW_ACTION_LABELS.logHours}
              </Button>
            }
          />
        ) : undefined
      }
    >
      {/*
        Disable, don't hide: a lapsed chapter still reads its log; only
        logging and withdrawing stop, and this says why.
      */}
      <SubscriptionNotice gate={gate} feature="logging service hours" />
      {log.withheld ? (
        /* The viewer's id is what scopes this log, so without it there is no
           honest list to show. Say which of the two states it is (#1346). */
        <p className="text-sm text-muted-foreground">
          {log.notice?.startsWith("Confirming")
            ? log.notice
            : "We couldn't confirm your account, so your hours and withdrawing are unavailable. Reload to try again."}
        </p>
      ) : (
        <ServiceYours
          entries={log.entries}
          totals={log.totals}
          semesterUnreadable={log.semesterUnreadable}
          entryMeta={serviceEntryMeta}
          canLog={log.canLog}
          onLogFirst={() => logDialog.setOpen(true)}
          logControlProps={gate.controlProps()}
          withdrawControlProps={gate.controlProps()}
          onWithdraw={(entry) => void log.withdraw(entry)}
          state={log.state}
          onRetry={log.retry}
          errorDescription={log.errorDescription}
          notice={log.notice}
        />
      )}
      {log.confirmDialog}
    </StandingPanelFrame>
  );
}
