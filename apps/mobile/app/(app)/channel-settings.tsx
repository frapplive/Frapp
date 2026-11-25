import { useEffect } from "react";
import { useRouter } from "expo-router";

/**
 * One channel's settings, on the phone (#6031): a pushed screen in the shape
 * of web's `/settings?tab=chat&channel=<id>`, replacing the Edit channel
 * sheet. Registered on the stack ahead of the screen itself, since the stack
 * layout is a frozen file (`spec/ui/mobile/navigation.md` § Hotspot freeze).
 * Until the screen lands nothing links here, and an early visit (a hand-typed
 * `frapp://channel-settings`) pops down to Chat home: `dismissTo`, never
 * `<Redirect>`, which would stack a second tab navigator over the first
 * (`navigation.md` § Going back), as `ask.tsx` and `chat.tsx` do.
 */
export default function ChannelSettingsRoute() {
  const router = useRouter();
  useEffect(() => {
    router.dismissTo("/");
  }, [router]);
  return null;
}
