import { redirect } from "next/navigation";
import { tasksRedirectPath } from "@/lib/tasks/task-links";

/**
 * The Tasks page folded into Activity with #5948 (step 4 of #5943): a
 * member's own tasks are Activity's Mine, and the chapter's board is its
 * Everyone's. This route only redirects old links, bookmarks and
 * notifications there, keeping `?task=` and `?group=` so the task still
 * opens in its panel.
 */
export default async function TasksRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(tasksRedirectPath(await searchParams));
}
