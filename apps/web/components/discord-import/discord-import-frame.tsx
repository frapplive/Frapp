"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DISCORD_IMPORT_COPY } from "@repo/validation";
import { SettingsSubpage } from "@/components/settings/settings-subpage";
import {
  CHAT_MODULE_SETTINGS_PATH,
  DISCORD_IMPORT_SETTINGS_PATH,
} from "@/components/settings/settings-paths";

/**
 * A line the page's states share, drawn first under the header: the stale
 * read's notice, whose live region stays mounted so its line is announced.
 */
export const DiscordImportNotice = createContext<ReactNode>(null);

/**
 * Discord import's page frame, drawn in place of the Chat page (#3837): the
 * way back to Chat, "Discord import", and one muted line saying the import's
 * state when the title alone can't (#6031, the settings-rows shape). Each of
 * the page's states draws its own, so a finished import's line and check mark
 * sit in the header rather than as a second headline in the body.
 */
export function DiscordImportFrame({
  description,
  titleLeading,
  children,
}: {
  description?: ReactNode;
  titleLeading?: ReactNode;
  children: ReactNode;
}) {
  const notice = useContext(DiscordImportNotice);
  return (
    <SettingsSubpage
      backHref={CHAT_MODULE_SETTINGS_PATH}
      backLabel={DISCORD_IMPORT_COPY.backLabel}
      title={DISCORD_IMPORT_COPY.title}
      titleLeading={titleLeading}
      description={description}
    >
      {notice}
      {children}
    </SettingsSubpage>
  );
}

/** A page one of the import's rows opens, with its way back to the import. */
export function DiscordImportPageFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const notice = useContext(DiscordImportNotice);
  return (
    <SettingsSubpage
      backHref={DISCORD_IMPORT_SETTINGS_PATH}
      backLabel={DISCORD_IMPORT_COPY.title}
      title={title}
    >
      {notice}
      {children}
    </SettingsSubpage>
  );
}
