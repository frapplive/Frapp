import { useMemo } from "react";
import { eventInvitees, type EventAttendanceFields } from "@repo/validation";
import { memberLabel } from "./display-names";
import { useMembers, type MemberProfile } from "./use-members";

/**
 * The members an event invites, by name, from the chapter's member list and
 * the event's role rule (`eventInvitees`): the event page's Who's coming
 * list and headcount, and the roster's rows, on both apps. `null` while the
 * list loads or when it can't be read, so a count never reads as zero by
 * mistake.
 */
export function useEventInvitees(
  audience: EventAttendanceFields,
): MemberProfile[] | null {
  const membersQuery = useMembers();
  const {
    is_mandatory,
    required_role_ids,
    optional_role_ids,
    excluded_role_ids,
    others_invited,
  } = audience;
  return useMemo(() => {
    if (!membersQuery.data) return null;
    const invited = eventInvitees(
      {
        is_mandatory,
        required_role_ids,
        optional_role_ids,
        excluded_role_ids,
        others_invited,
      },
      membersQuery.data.filter((member) => !!member.user_id),
    );
    return [...invited].sort((a, b) =>
      memberLabel(a.display_name, a.user_id).localeCompare(
        memberLabel(b.display_name, b.user_id),
      ),
    );
  }, [
    membersQuery.data,
    is_mandatory,
    required_role_ids,
    optional_role_ids,
    excluded_role_ids,
    others_invited,
  ]);
}
