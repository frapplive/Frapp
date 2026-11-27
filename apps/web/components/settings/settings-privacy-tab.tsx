"use client";

import { PRIVACY_SETTINGS_COPY as COPY } from "@repo/validation";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";

type Props = {
  /** Current persisted value of `chapters.analytics_opt_out`. */
  analyticsOptOut: boolean;
  /** Whether the caller holds `chapter-config:manage`. */
  canManage: boolean;
  /** Persist the opt-out through `usePatchOrgConfig`. */
  onToggle: (optOut: boolean) => void;
  isSaving?: boolean;
};

/**
 * Settings → Privacy (#6028): one switch row and one footnote, the same
 * words as the phone's Privacy screen (`PRIVACY_SETTINGS_COPY`). One group,
 * so no heading: the rail names the page.
 *
 * Today this is the analytics opt-out. The switch is framed positively
 * ("Chapter analytics" on/off) to avoid a double-negative, while the persisted
 * column stays `analytics_opt_out` — so checked = analytics enabled =
 * `!analytics_opt_out`. When opted out, web and mobile emit zero events for
 * this chapter's members (`isAnalyticsOptedOut` in `@repo/validation`) and
 * the API repeats the check as defense-in-depth
 * (`spec/behavior/data-retention.md` #analytics-events-pseudonymous). The write
 * goes through the config PATCH mutation, so it is recorded in Logs like every
 * other settings change.
 */
export function SettingsPrivacyTab({
  analyticsOptOut,
  canManage,
  onToggle,
  isSaving,
}: Props) {
  return (
    <SettingsGroup
      id="settings-privacy"
      label={COPY.title}
      footnote={canManage ? COPY.footnote : `${COPY.footnote} ${COPY.readOnly}`}
    >
      <SettingsRow
        id="settings-analytics"
        label={COPY.label}
        description={COPY.line}
        checked={!analyticsOptOut}
        disabled={!canManage || isSaving}
        onCheckedChange={(enabled) => onToggle(!enabled)}
      />
    </SettingsGroup>
  );
}
