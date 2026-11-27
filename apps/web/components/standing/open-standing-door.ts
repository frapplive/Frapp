import type { MouseEvent } from "react";
import { pushAddress } from "@/lib/address/address";
import { STANDING_PARAM, type StandingDoor } from "./standing-doors";

/**
 * A standing door's click on the profile itself (#6048, spec § Addresses):
 * the panel is a step this tab pushes, so its close goes Back and Forward
 * reopens it. Anywhere else (Activity's gauges), and for a modified click
 * that opens a new tab, the link navigates as usual.
 */
export function openStandingDoor(
  event: MouseEvent<HTMLAnchorElement>,
  door: StandingDoor,
): void {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0 ||
    window.location.pathname !== "/profile"
  )
    return;
  event.preventDefault();
  pushAddress({ [STANDING_PARAM]: door });
}
