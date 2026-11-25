import { Redirect } from "expo-router";

/**
 * One channel's settings, on the phone (#6031): a pushed screen in the shape
 * of web's `/settings?tab=chat&channel=<id>`, replacing the Edit channel
 * sheet. Registered on the stack ahead of the screen itself, since the stack
 * layout is a frozen file (`spec/ui/mobile/navigation.md` § Hotspot freeze);
 * until the screen lands nothing links here, and an early visit goes back to
 * Chat home rather than to an empty page.
 */
export default function ChannelSettingsRoute() {
  return <Redirect href="/" />;
}
