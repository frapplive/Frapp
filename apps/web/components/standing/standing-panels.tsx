"use client";

import { MyPointsPanel } from "./my-points-panel";
import { MyServicePanel } from "./my-service-panel";
import { MyStudyPanel } from "./my-study-panel";
import type { StandingDoor } from "./standing-doors";

/**
 * The panel behind the open door, docked in place of the Profile page
 * (#5950). One at a time, named by `/profile?open=`; closing it returns to
 * the profile under it, which stays mounted with whatever the member typed.
 */
export function StandingPanels({
  open,
  onClose,
}: {
  open: StandingDoor | null;
  onClose: () => void;
}) {
  if (open === "points") return <MyPointsPanel onClose={onClose} />;
  if (open === "service") return <MyServicePanel onClose={onClose} />;
  if (open === "study") return <MyStudyPanel onClose={onClose} />;
  return null;
}
