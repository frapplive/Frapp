"use client";

import { useState } from "react";
import { EVENT_PAGE_COPY, type EventAttendanceFields } from "@repo/validation";
import {
  EVENT_PEOPLE_SHOWN,
  useEventInvitees,
  useMembers,
} from "@repo/hooks";
import { memberLabel } from "@repo/hooks/display-names";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SectionSkeleton } from "@/components/shared/page-skeletons";
import { SkeletonText } from "@/components/shared/async-states";
import { NestedError } from "@/components/shared/nested-states";
import { cn, initials } from "@/lib/utils";
import { FOCUS_RING_OFFSET } from "@/components/ui/focus";

/**
 * Who's coming, as people: the event page's side list before check-in
 * opens, and for anyone who can't take attendance (Paul, 2026-11-22). Names
 * and faces only, no statuses: those are the roster's, and only an officer's.
 * Luma's and Google Calendar's guest lists set it out the same way, a count
 * and the people, with the rest a click away.
 */
export function EventPeople({ audience }: { audience: EventAttendanceFields }) {
  const invitees = useEventInvitees(audience);
  // The same cached read `useEventInvitees` makes, for its failure: `null`
  // there is loading or failed alike.
  const membersQuery = useMembers();
  const [showAll, setShowAll] = useState(false);

  if (invitees === null && membersQuery.isError) {
    return (
      <section aria-label="Who's coming" className="grid gap-2">
        <h3 className="text-sm font-semibold">Who&apos;s coming</h3>
        <NestedError
          title="Who's coming unavailable"
          description="Couldn't load the chapter's members. Retry in a moment."
          onRetry={() => void membersQuery.refetch()}
        />
      </section>
    );
  }

  if (invitees === null) {
    return (
      <SectionSkeleton label="Loading who's coming">
        <SkeletonText lines={3} />
      </SectionSkeleton>
    );
  }

  const shown = showAll ? invitees : invitees.slice(0, EVENT_PEOPLE_SHOWN);
  return (
    <section aria-label="Who's coming" className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Who&apos;s coming</h3>
        <span className="text-caption text-muted-foreground">
          {EVENT_PAGE_COPY.people(invitees.length)}
        </span>
      </div>
      {invitees.length > 0 ? (
        <ul className="divide-y divide-border">
          {shown.map((member) => {
            const name = memberLabel(member.display_name, member.user_id);
            return (
              <li
                key={member.user_id}
                className="flex min-h-9 min-w-0 items-center gap-2.5 py-1"
              >
                <Avatar className="h-6 w-6 shrink-0">
                  {member.avatar_url ? (
                    <AvatarImage src={member.avatar_url} alt="" />
                  ) : null}
                  <AvatarFallback className="text-[10px]">
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 truncate text-sm">{name}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {invitees.length > EVENT_PEOPLE_SHOWN ? (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll((value) => !value)}
          className={cn(
            "justify-self-start rounded-sm text-caption text-muted-foreground underline-offset-2 hover:text-foreground hover:underline",
            FOCUS_RING_OFFSET,
          )}
        >
          {showAll ? EVENT_PAGE_COPY.showFewer : EVENT_PAGE_COPY.showAll(invitees.length)}
        </button>
      ) : null}
    </section>
  );
}
