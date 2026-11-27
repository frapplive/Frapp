import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ASSIGNED_PARAM, RELEASED_PARAM } from "@/lib/tasks/open-tasks";

/** The params `/tasks` links carried, which Activity reads now. */
const KEPT = ["task", RELEASED_PARAM, ASSIGNED_PARAM] as const;

/**
 * `/tasks`: only sends its links on to the Activity tab (#5948 slice 3).
 *
 * The phone's Tasks screen folded into Activity, as web's Tasks page did:
 * the member's own tasks are To do's rows and Up for grabs is a card of
 * Mine, the chapter's tasks are Everyone's, and the points line is on You.
 * The route stays registered (`app/(app)/_layout.tsx` is frozen) so an old
 * link, a push from an older server, or a `frapp://tasks` link still lands:
 * `?task=<id>` opens that task's screen over Activity, and `?released=` and
 * `?assigned=` say their line on Up for grabs.
 *
 * It pops down to the tab (`dismissTo`), never `<Redirect>`, which replaces
 * this pushed screen with the tab and so stacks a second tab navigator
 * (`navigation.md` § Going back), as `ask.tsx` does. It draws nothing.
 */
export default function TasksRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<(typeof KEPT)[number], string>>();
  const kept: Record<string, string> = {};
  for (const name of KEPT) {
    const value = params[name];
    if (typeof value === "string" && value !== "") kept[name] = value;
  }
  const key = JSON.stringify(kept);
  useEffect(() => {
    router.dismissTo({
      pathname: "/activity",
      params: JSON.parse(key) as Record<string, string>,
    });
  }, [router, key]);
  return null;
}
