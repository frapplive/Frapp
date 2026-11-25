export const metadata = {
  title: "Chat",
};

/**
 * `/chat` is the dashboard with no page open (#3779): the open conversation
 * alone. Chat itself is a panel the shell hosts on every route
 * (`components/layout/dashboard-shell.tsx`), so this route renders nothing of
 * its own. Its `?channel=` and `?message=` links still land, because the
 * panel reads them.
 */
export default function Chat() {
  return null;
}
