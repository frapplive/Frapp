import { useState } from "react";
import { Share } from "react-native";
import {
  rushPipelineAccess,
  useInterestFormSettings,
  useUpdateInterestForm,
} from "@repo/hooks";
import { INTEREST_FORM_SETTINGS_COPY as COPY } from "@repo/validation";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import { Toggle } from "@/components/toggle";
import { webAppOrigin } from "@/lib/onboarding/chapter-wizard/invite-link";

/**
 * The interest form on the phone's Chapter settings (#5977): what a
 * recruitment chair does at a table, not at a desk. Open or close it, share
 * its link, and ask "Who referred you?". The questions, blurb, QR codes,
 * contacts and replacing the form are web's Recruitment page, which an
 * officer sets up once (`ifc-recruitment.md` § A recruitment week at real
 * scale; Shawn's "where the phone stops", 2026-11-22). Saves on its own; a
 * failed save is the row's second line and the switch snaps back.
 */
export function InterestFormSettingsSection({
  permissions,
  moduleOn,
}: {
  permissions: readonly string[] | null | undefined;
  moduleOn: boolean;
}) {
  const access = rushPipelineAccess(permissions);
  const settings = useInterestFormSettings({
    enabled: moduleOn && access.view,
  });
  const update = useUpdateInterestForm();
  const [failed, setFailed] = useState<"open" | "referrer" | null>(null);
  const form = settings.data?.form;
  if (!moduleOn || !access.view || !settings.data?.offered || !form) {
    return null;
  }
  // The public form lives on the web app (`/f/<slug>`, ADR-27).
  const url = `${webAppOrigin()}${form.path}`;
  const failedLine = COPY.saveFailed;

  return (
    <>
      <SectionHeader>{COPY.title}</SectionHeader>
      <ListSection>
        <ListRow
          label={COPY.open}
          description={failed === "open" ? failedLine : undefined}
          descriptionTone={failed === "open" ? "destructive" : "default"}
          trailing={
            <Toggle
              value={form.is_open}
              disabled={!access.manage || update.isPending}
              accessibilityLabel={COPY.open}
              onValueChange={(next) => {
                setFailed(null);
                update.mutate(
                  { is_open: next },
                  { onError: () => setFailed("open") },
                );
              }}
            />
          }
        />
        <ListRow
          label={COPY.link}
          value={url.replace(/^https?:\/\//, "")}
          accessibilityHint="Opens the share sheet for the form's link."
          onPress={() => void Share.share({ message: url, url })}
        />
        <ListRow
          label={COPY.askReferrer}
          description={failed === "referrer" ? failedLine : undefined}
          descriptionTone={failed === "referrer" ? "destructive" : "default"}
          trailing={
            <Toggle
              value={form.ask_referrer}
              disabled={!access.manage || update.isPending}
              accessibilityLabel={COPY.askReferrer}
              onValueChange={(next) => {
                setFailed(null);
                update.mutate(
                  { ask_referrer: next },
                  { onError: () => setFailed("referrer") },
                );
              }}
            />
          }
        />
      </ListSection>
    </>
  );
}
