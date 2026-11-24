export const metadata = {
  title: "Messages",
};

/**
 * The Messages page (#5946): the member's direct and group conversations
 * listed beside the open one, the web twin of the phone's Messages tab. Like
 * `/chat` it renders nothing of its own: chat is a panel the shell hosts on
 * every route (`components/layout/dashboard-shell.tsx`), and on this route
 * the panel shows its conversation list. A `?channel=` link lands here as it
 * does on `/chat`.
 */
export default function Messages() {
  return null;
}
