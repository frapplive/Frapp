"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  useUpdateUserSettings,
  useUserSettings,
  type UserSettings as StoredUserSettings,
} from "@repo/hooks";
import {
  PERSONAL_SETTINGS_COPY,
  localTimeZone,
  timeZoneCity,
} from "@repo/validation";
import { Button } from "@/components/ui/button";
import { TimeField } from "@/components/ui/time-field";
import { useToast } from "@/lib/hooks/use-toast";
import { SectionLabel } from "@/components/shared/section-label";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { anyReadUncached, pausedRead } from "@/components/shared/async-states";
import { NestedError, NestedOffline } from "@/components/shared/nested-states";
import { useNetwork } from "@/lib/providers/network-provider";
import { getErrorMessage } from "@/lib/utils";
import { QuietHoursSkeleton } from "@/components/personal-settings/personal-settings-skeleton";

/**
 * The quiet-hour fields `PATCH /v1/settings` accepts and this screen edits.
 *
 * `theme` is deliberately absent. See the Quiet hours section below. Picked from
 * the contract's type, so renaming one of these fields there fails to compile
 * here rather than seeding an empty input.
 */
/** A time field sized to its value inside a settings row. */
const TIME_FIELD = "w-32";

type UserSettings = Partial<
  Pick<
    StoredUserSettings,
    "quiet_hours_start" | "quiet_hours_end" | "quiet_hours_tz"
  >
>;

/**
 * Settings → Notifications → Quiet hours. They are stored on the person
 * (`user_settings`), not on a chapter, so they sit in the rail's "My account"
 * group and follow the member into every chapter. Moved here from `/profile`
 * with the rest of the personal settings (#3856).
 */
export function QuietHoursSection() {
  const { toast } = useToast();
  const { isOffline } = useNetwork();
  const settingsQuery = useUserSettings();
  const updateSettings = useUpdateUserSettings();
  const [settingsDraft, setSettingsDraft] = useState<UserSettings>({});

  useEffect(() => {
    // Hold the draft while a save is in flight or has failed.
    //
    // `useUpdateUserSettings` writes optimistically and rolls back on error
    // (#312), so `settingsQuery.data` now changes twice per save instead of
    // once on success. Without this guard the rollback re-runs this effect and
    // overwrites the draft with the stored settings — silently discarding the
    // edits the member just failed to save, next to a toast telling them to try
    // again. `isError` stays true until the next `mutate`, so the retry path
    // resyncs normally once it succeeds.
    if (updateSettings.isPending || updateSettings.isError) return;
    if (settingsQuery.data) {
      /* eslint-disable react-hooks/set-state-in-effect -- re-seed settings draft from the query except while a save is in flight or failed */
      setSettingsDraft(settingsQuery.data);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [settingsQuery.data, updateSettings.isPending, updateSettings.isError]);

  /*
   * Switching off clears the stored window, so the last one is kept here and
   * comes back when the member switches on again on this page. Mobile keeps
   * the same thing on the device; a fresh page load falls back to 10 PM to 8 AM.
   */
  const lastWindow = useRef<{ start: string; end: string; tz: string | null }>(
    null,
  );
  useEffect(() => {
    const stored = settingsQuery.data;
    if (stored?.quiet_hours_start && stored.quiet_hours_end) {
      lastWindow.current = {
        start: stored.quiet_hours_start,
        end: stored.quiet_hours_end,
        tz: stored.quiet_hours_tz?.trim() || null,
      };
    }
  }, [settingsQuery.data]);

  /*
   * Quiet hours are on exactly when a window is stored: the server derives
   * enforcement from `quiet_hours_start`/`quiet_hours_end`, so the switch reads
   * the stored row, never the draft (spec/behavior/notifications.md § Quiet
   * Hours). Turning it off clears the window; turning it on stores the times
   * in the draft, or 10 PM to 8 AM for a member who has none.
   */
  const storedSettings = settingsQuery.data;
  const quietHoursOn = Boolean(
    storedSettings?.quiet_hours_start && storedSettings?.quiet_hours_end,
  );
  const browserZone = localTimeZone();
  const storedZone = storedSettings?.quiet_hours_tz?.trim() || null;
  // A window stored with no zone is evaluated in UTC by the server, so that is
  // the zone the line below names (spec/behavior/notifications.md § Quiet Hours).
  const zoneInForce = storedZone ?? "UTC";

  async function saveQuietHours(
    patch: UserSettings,
    successTitle: string,
  ): Promise<void> {
    try {
      await updateSettings.mutateAsync(patch);
      toast({ title: successTitle });
    } catch (error) {
      toast({
        title: "Couldn't save quiet hours",
        description: getErrorMessage(
          error,
          "Try again or check your connection.",
        ),
        variant: "destructive",
      });
    }
  }

  function refuseOffline(): boolean {
    if (!isOffline) return false;
    toast({
      title: "You're offline",
      description: "Reconnect to change quiet hours. Nothing has been changed.",
    });
    return true;
  }

  function handleQuietHoursToggle(on: boolean) {
    if (refuseOffline()) return;
    if (!on) {
      void saveQuietHours(
        {
          quiet_hours_start: null,
          quiet_hours_end: null,
          quiet_hours_tz: null,
        },
        "Quiet hours off",
      );
      return;
    }
    // The window and zone a member had before switching off come back. A
    // remembered zone is never re-judged here (this browser's tzdata can be
    // older than the server's); only a member with none gets this browser's.
    const last = lastWindow.current;
    void saveQuietHours(
      {
        quiet_hours_start: last?.start ?? "22:00",
        quiet_hours_end: last?.end ?? "08:00",
        quiet_hours_tz: last?.tz ?? browserZone,
      },
      "Quiet hours on",
    );
  }

  async function handleSettingsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (refuseOffline()) return;
    // Times only. The zone has its own control below, so a save here never
    // touches it, and a blank time can't clear the window by accident: the
    // switch is what turns quiet hours off.
    await saveQuietHours(
      {
        quiet_hours_start: settingsDraft.quiet_hours_start || undefined,
        quiet_hours_end: settingsDraft.quiet_hours_end || undefined,
      },
      "Quiet hours saved",
    );
  }

  function handleUseBrowserZone() {
    if (refuseOffline()) return;
    void saveQuietHours({ quiet_hours_tz: browserZone }, "Time zone updated");
  }

  const settings = settingsDraft;

  /*
   * The Quiet hours section has its own query, so it has its own set of
   * states. On `/profile` it once had none. A failed `/v1/settings` fetch rendered empty time
   * fields beside a live Save button, and because the submit maps an unloaded
   * field to `undefined` (so the PATCH omits it), pressing Save sent an empty
   * body and toasted "Preferences saved". That is #1209's "reports a failed
   * fetch as success", one screen over.
   *
   * `sole` is deliberately NOT passed to the nested error and offline states:
   * they sit inside an already-drawn settings page, which is exactly the case
   * `nested-states.tsx` describes as the default, and the reason the prop
   * defaults off. The loading branch is `QuietHoursSkeleton`, which carries
   * its own one-line status.
   */
  const settingsPaused = pausedRead(settingsQuery);
  let preferencesState: React.ReactNode = null;
  if (isOffline && anyReadUncached(settingsQuery)) {
    preferencesState = (
      <NestedOffline
        title="Quiet hours unavailable offline"
        description="Reconnect to load and change when notifications are silenced."
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  } else if (settingsQuery.isLoading || settingsPaused) {
    preferencesState = <QuietHoursSkeleton />;
  } else if (settingsQuery.isError && anyReadUncached(settingsQuery)) {
    preferencesState = (
      <NestedError
        title="Couldn't load your preferences"
        description="Quiet hours couldn't be read, so saving them would overwrite what's stored. Retry in a moment."
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  }

  /*
   * The page's first group (#6032): the switch, then From and To while it is
   * on (off, there is nothing for them to govern; owner, 2026-11-06), the way
   * the phone's Notifications page draws them. The times are `TimeField`s,
   * not the browser's time box (rulebook § 4), and keep their Save button
   * until the epic's last step makes typed settings save on their own (#6033).
   *
   * The zone is a fact, not a field. A member who never set one got this
   * browser's when they switched quiet hours on, so its row only shows when
   * the zone in force is another one, and offers the one fix that needs no
   * list, as the phone's Time zone row does.
   *
   * The Theme select that used to live here is gone: Frapp is dark-only and
   * nothing read `user_settings.theme` (#920). A control with no reader is
   * deleted, not restyled.
   */
  const startValue = (settings.quiet_hours_start ?? "").slice(0, 5);
  const endValue = (settings.quiet_hours_end ?? "").slice(0, 5);
  return (
    <section id="quiet-hours" className="scroll-mt-16">
      {preferencesState ? (
        <div className="space-y-2">
          <SectionLabel id="quiet-hours-label">
            {PERSONAL_SETTINGS_COPY.quietHours}
          </SectionLabel>
          {preferencesState}
        </div>
      ) : (
        <form className="space-y-3" onSubmit={handleSettingsSubmit}>
          <SettingsGroup
            heading={PERSONAL_SETTINGS_COPY.quietHours}
            footnote={PERSONAL_SETTINGS_COPY.quietHoursFootnote}
          >
            <SettingsRow
              label={PERSONAL_SETTINGS_COPY.quietHours}
              checked={quietHoursOn}
              // Not disabled offline: the switch keeps its state legible and
              // a press says why nothing changed (`refuseOffline`).
              disabled={updateSettings.isPending}
              onCheckedChange={handleQuietHoursToggle}
            />
            {quietHoursOn ? (
              <>
                <SettingsRow
                  label="From"
                  control={
                    <TimeField
                      id="quiet-start"
                      aria-label="Quiet hours start"
                      className={TIME_FIELD}
                      anchor="22:00"
                      value={startValue}
                      onChange={(next) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          quiet_hours_start: next,
                        }))
                      }
                    />
                  }
                />
                <SettingsRow
                  label="To"
                  control={
                    <TimeField
                      id="quiet-end"
                      aria-label="Quiet hours end"
                      className={TIME_FIELD}
                      anchor="08:00"
                      value={endValue}
                      onChange={(next) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          quiet_hours_end: next,
                        }))
                      }
                    />
                  }
                />
                {zoneInForce !== browserZone ? (
                  <SettingsRow
                    label="Time zone"
                    description={`Times are in ${timeZoneCity(zoneInForce)} time. This browser is on ${timeZoneCity(browserZone)} time.`}
                    control={
                      <Button
                        type="button"
                        variant="secondary"
                        size="toolbar"
                        disabled={updateSettings.isPending}
                        onClick={handleUseBrowserZone}
                      >
                        Use {timeZoneCity(browserZone)} time
                      </Button>
                    }
                  />
                ) : null}
              </>
            ) : null}
          </SettingsGroup>
          {quietHoursOn ? (
            <div className="flex justify-end">
              <Button
                type="submit"
                size="toolbar"
                disabled={updateSettings.isPending || !startValue || !endValue}
              >
                {updateSettings.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Save quiet hours
              </Button>
            </div>
          ) : null}
        </form>
      )}
    </section>
  );
}
