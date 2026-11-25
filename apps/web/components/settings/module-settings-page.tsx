"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { permissionOfWhoCanPage } from "@repo/hooks/module-settings";
import { Badge } from "@/components/ui/badge";
import { type ModuleSettings } from "@/components/settings/settings-modules";
import { modulePermissions } from "@/components/settings/settings-modules";
import { SettingsSubpage } from "@/components/settings/settings-subpage";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import {
  ModuleWhoCanGroup,
  WhoCanPermissionPage,
} from "@/components/settings/module-who-can";
import {
  moduleTierKind,
  moduleTierLabel,
} from "@/components/settings/settings-status";

/** A page one of the module page's rows opens (`?page=<id>`). */
export type ModulePage = {
  id: string;
  title: string;
  body: ReactNode;
};

type Props = {
  module: ModuleSettings;
  /** The resolved switch: the value `ChapterGuard` enforces (#3028). */
  on: boolean;
  /** Whether the viewer holds `chapter-config:manage`. */
  canManage: boolean;
  /** This module's `enabled_modules` leaf is saving. */
  switchPending?: boolean;
  onToggle: (enabled: boolean) => void;
  /**
   * The groups between the switch and Who can, in the order an officer uses
   * them: Rules (typed in place), Tools, Goals, each a `SettingsGroup`.
   */
  body?: ReactNode;
  /** The pages `body`'s rows open. */
  pages?: readonly ModulePage[];
  /** The open page (`?page=`), or null for the module page itself. */
  page: string | null;
  /** The module page's address, or one of its pages'. */
  pageHref: (page: string | null) => string;
  /** Whether the viewer can read roles (`members:view`) for "Who can". */
  canSeeWhoCan: boolean;
  /** Whether the viewer can change roles (`roles:manage`) from "Who can". */
  canEditRoles?: boolean;
  /** A line on one permission's Who can page, by permission. */
  permissionNotes?: Readonly<Record<string, ReactNode>>;
  /**
   * Focus the switch on mount: chat's ops-setup nudge (#492) lands an officer
   * here to turn the module on.
   */
  focusSwitch?: boolean;
  /** Called once focus landed, so the page latches the deep link. */
  onSwitchFocused?: (moduleKey: string) => void;
};

/**
 * One module's page in Chapter settings (#4073), in the shape of Discord's
 * channel settings and iOS Settings (#6030, `spec/ui/design-system/
 * components.md` § Settings rows): the module's switch as the first row,
 * then the rules typed in place, then rows that each show their current
 * value and open a page of their own (a tool, a goal, a list of stages, who
 * can do one thing), with a way back.
 *
 * The order is the order an officer setting a module up goes in: on or off,
 * the rules, the tool they open most (Chat admin, the ledger, Study zones),
 * what members are held to, then who may do what. Everything shown is stored
 * and read somewhere; a module with nothing to set shows only its switch and
 * Who can, rather than a disabled placeholder (#1760, #3439).
 */
export function ModuleSettingsPage({
  module,
  on,
  canManage,
  switchPending,
  onToggle,
  body,
  pages = [],
  page,
  pageHref,
  canSeeWhoCan,
  canEditRoles = false,
  permissionNotes,
  focusSwitch = false,
  onSwitchFocused,
}: Props) {
  const switchId = `settings-module-${module.key}-switch`;
  useEffect(() => {
    if (!focusSwitch) return;
    const control = document.getElementById(switchId);
    if (!control) return;
    // Focus, then center: a keyboard or screen-reader officer arriving from
    // the nudge lands on the control they were sent to, not on the body.
    control.focus({ preventScroll: true });
    control.scrollIntoView?.({ block: "center", behavior: "smooth" });
    onSwitchFocused?.(module.key);
  }, [focusSwitch, onSwitchFocused, module.key, switchId]);

  // Back from one of its pages, focus returns to the row that opened it, as
  // it would on a page that never went away.
  const lastPage = useRef(page);
  useEffect(() => {
    const left = lastPage.current;
    lastPage.current = page;
    if (page || !left) return;
    const active = document.activeElement;
    // A page kept mounted (below) only hides, so its back link can still be
    // the focused element; that counts as focus having nowhere to be.
    if (active && active !== document.body && !active.closest("[hidden]")) {
      return;
    }
    document.getElementById(`module-row-${left}`)?.focus();
  }, [page]);

  // A permission's page only for a viewer who can read the roles, and only
  // for a permission of this module; anything else shows the module page.
  const permission = permissionOfWhoCanPage(page);
  const whoCanEntry =
    permission && canSeeWhoCan
      ? modulePermissions(module.key).find(
          (entry) => entry.permission === permission,
        )
      : undefined;
  const openPage = pages.find((candidate) => candidate.id === page);
  const showingPage = Boolean(openPage || whoCanEntry);

  // A page stays mounted, hidden, once it has been opened, so a draft typed
  // on it (a goal, a stage's new name, the report form's picks, a
  // half-drawn zone) is still there on the way back (#4857), as the Chapter
  // tab's pages keep theirs. Pages never opened aren't mounted, so the
  // module page doesn't load every tool it lists.
  const [visited, setVisited] = useState<ReadonlySet<string>>(
    () => new Set(openPage ? [openPage.id] : []),
  );
  if (openPage && !visited.has(openPage.id)) {
    setVisited(new Set([...visited, openPage.id]));
  }

  const subpage = (
    title: string,
    children: ReactNode,
    shown = true,
    description?: ReactNode,
  ) => (
    <SettingsSubpage
      shown={shown}
      backHref={pageHref(null)}
      backLabel={module.label}
      title={title}
      description={description}
    >
      {children}
    </SettingsSubpage>
  );

  const offLine = `Off. ${module.offNote} Turning it back on brings everything back; nothing was deleted.`;
  const roleLine =
    !module.alwaysOn && !canManage
      ? "Your role can't switch modules on or off."
      : null;
  const switchDescription =
    [!on && !module.alwaysOn ? offLine : null, roleLine]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <>
      {/*
        The module page stays mounted while one of its pages shows, so a
        number typed into a rule and not yet saved survives the trip.
      */}
      <div hidden={showingPage} className="space-y-8">
        <header className="space-y-1 border-b border-border pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-title text-foreground">{module.label}</h2>
            <Badge variant={moduleTierKind(module.tier)}>
              {moduleTierLabel(module.tier)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{module.description}</p>
        </header>

        <SettingsGroup label={`${module.label} on or off`}>
          {module.alwaysOn ? (
            <SettingsRow
              label={module.label}
              control={
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                  Always on
                </span>
              }
            />
          ) : (
            <SettingsRow
              id={switchId}
              label={module.label}
              description={switchDescription}
              checked={on}
              disabled={!canManage || switchPending}
              onCheckedChange={onToggle}
            />
          )}
        </SettingsGroup>

        {body}

        {canSeeWhoCan ? (
          <ModuleWhoCanGroup
            moduleKey={module.key}
            pageHref={(id) => pageHref(id)}
          />
        ) : null}
      </div>

      {pages.map((candidate) =>
        candidate.id === page ? (
          <div key={candidate.id}>
            {subpage(candidate.title, candidate.body)}
          </div>
        ) : visited.has(candidate.id) ? (
          <div key={candidate.id} hidden>
            {subpage(candidate.title, candidate.body, false)}
          </div>
        ) : null,
      )}

      {whoCanEntry && !openPage
        ? subpage(
            whoCanEntry.label,
            <WhoCanPermissionPage
              permission={whoCanEntry.permission}
              canEdit={canEditRoles}
              note={permissionNotes?.[whoCanEntry.permission]}
            />,
            true,
            whoCanEntry.description,
          )
        : null}
    </>
  );
}
