/**
 * `/messages` renders nothing of its own, as `/chat` doesn't: chat is the
 * shell's panel and paints its own skeleton, so the route's loader is empty
 * rather than falling back to the dashboard-wide card.
 */
export default function Loading() {
  return null;
}
