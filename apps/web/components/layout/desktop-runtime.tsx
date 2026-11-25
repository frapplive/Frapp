"use client";

import { useSyncExternalStore } from "react";
import { useDesktopRuntime } from "@/components/layout/use-desktop-runtime";
import { desktopBridge } from "@/lib/desktop/bridge";

// The bridge is set by the shell's preload before the page runs and never
// changes, so there is nothing to subscribe to.
const never = () => () => {};
const inDesktopApp = () => desktopBridge() !== null;
const onServer = () => false;

function Runtime(): null {
  useDesktopRuntime();
  return null;
}

/**
 * The desktop app's icon count and system notifications (#4842), mounted by
 * the dashboard shell. Renders nothing, and in a browser runs nothing: the
 * reads `useDesktopRuntime` subscribes to stay out of every web member's
 * shell.
 */
export function DesktopRuntime() {
  const desktop = useSyncExternalStore(never, inDesktopApp, onServer);
  return desktop ? <Runtime /> : null;
}
