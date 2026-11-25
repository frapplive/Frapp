"use client";

import type { ReactNode } from "react";
import {
  Panel,
  PanelBody,
  PanelContent,
  PanelHeader,
} from "@/components/shared/panel";

/**
 * A standing panel's shell: docked in place of the Profile page, beside chat,
 * with a back arrow to the profile (`Panel docked`, rulebook § 2: a record
 * docks in place). The header carries the panel's own actions; the body is a
 * container, so its rows count the panel's width and not the window's.
 */
export function StandingPanelFrame({
  title,
  actions,
  onClose,
  children,
}: {
  title: string;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Panel
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      docked
      backLabel="Back to your profile"
    >
      <PanelContent aria-describedby={undefined}>
        <PanelHeader actions={actions}>{title}</PanelHeader>
        <PanelBody className="@container gap-6 pt-5">{children}</PanelBody>
      </PanelContent>
    </Panel>
  );
}

/** A stat on the panel's surface: the label over the number, no frame. */
export function StandingStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="text-headline font-bold tabular-nums text-foreground">
          {value}
        </span>
        {detail ? (
          <span className="text-caption tabular-nums text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
