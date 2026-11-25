"use client";

import { PERSONAL_SETTINGS_COPY } from "@repo/validation";
import { ChatDensityControl } from "@/components/profile/chat-density-control";
import { ReadReceiptsSection } from "@/components/personal-settings/read-receipts-section";
import { SectionLabel } from "@/components/shared/section-label";

/**
 * Settings → Chat (#6032; "Appearance and chat" until then): how the thread
 * draws, and read receipts on direct messages. The phone's Chat page holds
 * the same two groups; there the density row opens the same three previews
 * in a sheet, where web has the width to set them side by side.
 *
 * Density is kept on the device (§11 § Density), so its footnote says so: a
 * phone can stay cozy while a laptop goes compact. There is no theme choice:
 * Frapp is dark-only (#3330).
 */
export function ChatSection() {
  return (
    <div className="flex flex-col gap-8">
      <section
        id="chat-density"
        aria-labelledby="chat-density-label"
        className="scroll-mt-16 space-y-2"
      >
        <SectionLabel id="chat-density-label">
          {PERSONAL_SETTINGS_COPY.density}
        </SectionLabel>
        <ChatDensityControl />
        <p className="px-1 text-caption text-muted-foreground">
          Applies on this browser.
        </p>
      </section>
      <ReadReceiptsSection />
    </div>
  );
}
