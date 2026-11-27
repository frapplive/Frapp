"use client";

import { Link2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionMenuButton } from "@/components/shared/row-menu";
import { LinkedAppRow } from "@/components/linked-apps/linked-app-row";
import { useCalendarLinkActions } from "@/lib/events/calendar-link-actions";

/**
 * Settings → Linked apps → Calendar apps: the member's private subscription
 * link for every calendar app that isn't Google (`spec/behavior/events.md`
 * § Calendar subscription), copied in one click with the apps and Reset a
 * menu away. The phone's row of the same name opens the same link in a sheet.
 * It was its own Settings page, Calendar, until #6032 folded it in here.
 */
export function CalendarAppsRow() {
  // The link is made the first time it's asked for (Copy, or the menu), not
  // when the page opens, so glancing at Settings mints no link.
  const [wanted, setWanted] = useState(false);
  const { link, apps, copyLink, resetLink, resetting, confirmDialog } =
    useCalendarLinkActions({ enabled: wanted });

  async function copy() {
    setWanted(true);
    const url = link.data?.url ?? (await link.refetch()).data?.url;
    await copyLink(url);
  }

  return (
    <>
      <LinkedAppRow
        icon={<Link2 className="text-foreground" />}
        name="Calendar apps"
        showMark={false}
        state={{
          tone: link.isError ? "expired" : "connected",
          detail: link.isError
            ? "Couldn't get your link. Try again in a moment"
            : "Apple Calendar and others, by link",
        }}
      >
        <Button
          variant="secondary"
          size="toolbar"
          disabled={link.isFetching && !link.data}
          onClick={() => void copy()}
        >
          Copy link
        </Button>
        <ActionMenuButton
          label="More for Calendar apps"
          onOpenChange={(open) => open && setWanted(true)}
          entries={[
            {
              type: "item",
              key: "apple",
              label: "Add to Apple Calendar",
              href: apps?.apple,
              disabled: !apps,
            },
            {
              type: "item",
              key: "outlook",
              label: "Add to Outlook.com",
              href: apps?.outlook,
              external: true,
              disabled: !apps,
            },
            {
              type: "item",
              key: "outlook-work",
              label: "Add to Outlook for school or work",
              href: apps?.outlookWork,
              external: true,
              disabled: !apps,
            },
            { type: "separator", key: "reset-sep" },
            {
              type: "item",
              key: "reset",
              label: "Reset link",
              icon: RotateCcw,
              disabled: !link.data || resetting,
              onSelect: () => void resetLink(),
            },
          ]}
        />
      </LinkedAppRow>
      {confirmDialog}
    </>
  );
}
