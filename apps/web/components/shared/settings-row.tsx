"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { RowMenu, type RowMenuEntry } from "@/components/shared/row-menu";
import { SectionLabel } from "@/components/shared/section-label";
import { compactControlClassName } from "@/components/shared/table-controls";
import { Switch } from "@/components/ui/switch";
import { FOCUS_RING } from "@/components/ui/focus";
import { cn } from "@/lib/utils";

/**
 * The one settings row on web, and the group that holds it (rulebook § 9,
 * `spec/ui/design-system/components.md` § Settings rows). The phone draws the
 * same shape with `ListSection` and `ListRow` (`apps/mobile/components/list-section.tsx`).
 *
 * A row is a label, at most one short muted line, and one trailing thing:
 *
 * - a switch (`checked` + `onCheckedChange`), saved the moment it flips;
 * - a current value that opens a picker (`value` + `onClick`, or wrap a
 *   `Select`/picker trigger in `control`);
 * - a chevron to another page (`href`).
 *
 * A row that opens a page can also carry actions (`menu`): right-click and
 * the ⋯ that shows on hover, the same entries (`RowMenu`), as Discord's role
 * list does. Every row with actions has one (rulebook § 3).
 *
 * The group is the bordered, divided list (iOS Settings, Slack preferences),
 * so settings never sit in a card each.
 */
export function SettingsGroup({
  label,
  heading,
  footnote,
  children,
  className,
  id,
}: {
  /** For a settings-search jump or a deep link to land on the group. */
  id?: string;
  /** Accessible name when the group has no visible heading above it. */
  label?: string;
  /**
   * The group's name, drawn above it as a section label and naming the list
   * (Discord's channel settings, iOS Settings). Most groups need none.
   */
  heading?: string;
  /**
   * One muted line under the group, saying what its rows have in common or
   * what changing them does (Discord's "Change privacy settings and customize
   * how members can interact with this channel."; iOS Settings' group
   * footers). Never a second copy of a row's own words.
   */
  footnote?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  const list = (
    <ul
      id={heading || footnote ? undefined : id}
      aria-label={heading ? undefined : label}
      aria-labelledby={heading ? headingId : undefined}
      className={cn(
        "divide-y divide-border rounded-[14px] border border-border bg-card",
        heading || footnote ? undefined : className,
      )}
    >
      {children}
    </ul>
  );
  if (!heading && !footnote) return list;
  return (
    <div id={id} className={cn("space-y-2", className)}>
      {heading ? <SectionLabel id={headingId}>{heading}</SectionLabel> : null}
      {list}
      {footnote ? (
        <p className="px-1 text-caption text-muted-foreground">{footnote}</p>
      ) : null}
    </div>
  );
}

type Trailing =
  | {
      checked: boolean;
      onCheckedChange: (next: boolean) => void;
      disabled?: boolean;
      value?: never;
      onClick?: never;
      href?: never;
      control?: never;
    }
  | {
      value: ReactNode;
      onClick: () => void;
      checked?: never;
      onCheckedChange?: never;
      disabled?: boolean;
      href?: never;
      control?: never;
    }
  | {
      href: string;
      value?: ReactNode;
      checked?: never;
      onCheckedChange?: never;
      disabled?: never;
      onClick?: never;
      control?: never;
    }
  | {
      /** A picker trigger (Select, SearchablePicker) drawn at the row's end. */
      control: ReactNode;
      checked?: never;
      onCheckedChange?: never;
      disabled?: never;
      value?: never;
      onClick?: never;
      href?: never;
    };

/**
 * foundations §9's Settings row step: 36 to a mouse (44 until #6115), 44 to a
 * finger. A row with its muted line grows past it.
 */
const ROW =
  "flex min-h-control-settings-row items-center gap-4 px-4 py-1.5 pointer-coarse:min-h-11 group-first:rounded-t-[13px] group-last:rounded-b-[13px]";

export function SettingsRow(
  props: {
    label: ReactNode;
    /** One short line, only when the label alone can't say it. */
    description?: ReactNode;
    /** A setting that only matters under the row above it: drawn indented. */
    nested?: boolean;
    /** Its label greys while the setting it waits on is off. */
    muted?: boolean;
    /**
     * A destructive row (Delete channel), red and alone in the last group,
     * as Discord's channel settings and iOS Settings end with one. It opens a
     * confirm, so it draws no chevron.
     */
    destructive?: boolean;
    /**
     * A glyph before the label, for a row that opens a page of its own
     * (Discord's channel settings, iOS Settings). A switch row goes without.
     */
    icon?: LucideIcon;
    /**
     * In place of `icon`, for a row naming something with a colour of its
     * own: a role's or group's dot (Discord's role list).
     */
    leading?: ReactNode;
    /**
     * The id of the row's link, button or switch, for focus to come back to
     * and for a deep link or a search result to land on.
     */
    id?: string;
    /**
     * Actions on the row (a page or picker row only): right-click and ⋯.
     * Empty `entries` keeps the ⋯'s room without one, so a row with no
     * actions lines up with its neighbours that have them.
     */
    menu?: { entries: readonly RowMenuEntry[]; label: string };
  } & Trailing,
) {
  const {
    label,
    description,
    nested = false,
    muted = false,
    destructive = false,
  } = props;
  const Icon = props.icon;
  const row = cn(ROW, nested && "pl-10");
  const labelId = useId();
  const descriptionId = useId();
  const generatedSwitchId = useId();
  const switchId = props.id ?? generatedSwitchId;
  const isSwitch = "onCheckedChange" in props && !!props.onCheckedChange;
  // A switch row's label is a real <label>, so clicking the words flips it.
  const LabelTag = isSwitch ? "label" : "span";

  const glyph = props.leading ? (
    <span className="flex w-[18px] shrink-0 justify-center" aria-hidden>
      {props.leading}
    </span>
  ) : Icon ? (
    <Icon
      className="h-[18px] w-[18px] shrink-0 text-muted-foreground"
      aria-hidden
    />
  ) : null;
  const text = (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <LabelTag
        id={labelId}
        htmlFor={isSwitch ? switchId : undefined}
        className={cn(
          "text-sm font-medium",
          destructive
            ? "text-destructive"
            : muted
              ? "text-muted-foreground"
              : "text-foreground",
        )}
      >
        {label}
      </LabelTag>
      {description ? (
        <span id={descriptionId} className="text-caption text-muted-foreground">
          {description}
        </span>
      ) : null}
    </span>
  );

  // A row with actions: the ⋯ sits after the link or button, inside the row,
  // and right-click anywhere on the row opens the same entries.
  const withMenu = (body: ReactNode) =>
    props.menu && props.menu.entries.length === 0 ? (
      // No actions on this row, in a group whose other rows have them: the
      // ⋯'s room is kept, so every chevron lines up.
      <li className="group flex items-center pr-2">
        {body}
        <span aria-hidden className={cn(compactControlClassName, "shrink-0")} />
      </li>
    ) : props.menu ? (
      <RowMenu entries={props.menu.entries} label={props.menu.label}>
        {(menuButton) => (
          <li className="group flex items-center pr-2">
            {body}
            {menuButton}
          </li>
        )}
      </RowMenu>
    ) : (
      <li className="group">{body}</li>
    );

  if ("href" in props && props.href) {
    return withMenu(
      <Link
        id={props.id}
        href={props.href}
        data-row-link={props.menu ? "" : undefined}
        className={cn(
          row,
          props.menu && "min-w-0 flex-1",
          "transition hover:bg-card-hover",
          FOCUS_RING,
        )}
      >
        {glyph}
        {text}
        {props.value ? (
          <span className="text-sm text-muted-foreground">{props.value}</span>
        ) : null}
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </Link>,
    );
  }

  if ("onClick" in props && props.onClick) {
    return withMenu(
      <button
        id={props.id}
        type="button"
        onClick={props.onClick}
        disabled={props.disabled}
        className={cn(
          row,
          props.menu ? "min-w-0 flex-1" : "w-full",
          "text-left transition hover:bg-card-hover disabled:opacity-50",
          FOCUS_RING,
        )}
      >
        {glyph}
        {text}
        <span className="text-sm text-muted-foreground">{props.value}</span>
        {destructive ? null : (
          <ChevronRight
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        )}
      </button>,
    );
  }

  if ("onCheckedChange" in props && props.onCheckedChange) {
    return (
      <li className="group">
        <div className={row}>
          {glyph}
          {text}
          <Switch
            id={switchId}
            checked={props.checked}
            disabled={props.disabled}
            onCheckedChange={props.onCheckedChange}
            aria-labelledby={labelId}
            aria-describedby={description ? descriptionId : undefined}
          />
        </div>
      </li>
    );
  }

  return (
    <li id={props.id} className="group">
      <div className={row}>
        {glyph}
        {text}
        <div className="shrink-0">{props.control}</div>
      </div>
    </li>
  );
}
