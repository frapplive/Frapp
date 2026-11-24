/**
 * `/chat`'s page renders nothing of its own: chat is the shell's panel and
 * paints its own skeleton (`ChatRouteSkeleton`, through `chat-page.tsx`). So
 * the route's loader is empty, rather than falling back to the dashboard-wide
 * card, which would flash in a `<main>` the shell gives to the conversation.
 */
export default function Loading() {
  return null;
}
