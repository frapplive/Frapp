import { useState } from "react";
import type { OrgConfig } from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import {
  ADJUSTMENT_RATE_LIMIT_MAX,
  CHAPTER_POINTS_CONFIG_DEFAULTS,
  POINTS_ADJUSTMENT_MAX,
  POINTS_RULES_COPY,
  SERVICE_MINUTES_PER_POINT_DEFAULT,
  SERVICE_RULES_COPY,
  moduleRulesFootnote,
  serviceRateHint,
  servicePointsForDuration,
  type PatchChapterConfig,
} from "@repo/validation";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import { NumberRow } from "@/components/settings/modules/number-row";
import { Toggle } from "@/components/toggle";

/**
 * A module screen's Rules on the phone (#6030), web's `module-rules.tsx` in
 * the phone's grouped rows and words (`@repo/validation`
 * `module-settings-copy.ts`): only settings that are stored and read, each
 * typed or switched in place and saved on its own through the audited config
 * PATCH (`chapter-config:manage`). Web still saves the numbers on a button
 * until #6033; the phone saves them on leaving the field, as rulebook § 9
 * says every settings page will.
 */

type Patch = (diff: PatchChapterConfig) => Promise<unknown>;

/** Points → Rules: the two limits on points added or taken by hand. */
export function PointsRules({
  config,
  canManage,
  patch,
}: {
  config: OrgConfig | undefined;
  canManage: boolean;
  patch: Patch;
}) {
  const saved = config?.points ?? CHAPTER_POINTS_CONFIG_DEFAULTS;
  return (
    <>
      <SectionHeader>Rules</SectionHeader>
      <ListSection
        footnote={moduleRulesFootnote(canManage, POINTS_RULES_COPY.lead)}
      >
        <NumberRow
          {...POINTS_RULES_COPY.rate}
          value={saved.adjustment_rate_limit_per_hour}
          min={1}
          max={ADJUSTMENT_RATE_LIMIT_MAX}
          editable={canManage}
          onSave={(next) =>
            patch({
              points: {
                adjustment_rate_limit_per_hour: next ?? 1,
                anomaly_threshold: saved.anomaly_threshold,
              },
            })
          }
        />
        <NumberRow
          {...POINTS_RULES_COPY.flag}
          value={saved.anomaly_threshold}
          min={1}
          max={POINTS_ADJUSTMENT_MAX}
          editable={canManage}
          onSave={(next) =>
            patch({
              points: {
                adjustment_rate_limit_per_hour:
                  saved.adjustment_rate_limit_per_hour,
                anomaly_threshold: next ?? 1,
              },
            })
          }
        />
      </ListSection>
    </>
  );
}

/** Service hours → Rules: the point rate and the proof switch. */
export function ServiceHoursRules({
  config,
  canManage,
  patch,
}: {
  config: OrgConfig | undefined;
  canManage: boolean;
  patch: Patch;
}) {
  const rate =
    config?.service?.minutes_per_point ?? SERVICE_MINUTES_PER_POINT_DEFAULT;
  const workflows = config?.workflows ?? [];
  const proofWorkflow = workflows.find((wf) => wf.key === "wf_hours_receipt");
  const [proofSaving, setProofSaving] = useState(false);
  const [proofFailed, setProofFailed] = useState<string | null>(null);

  return (
    <>
      <SectionHeader>Rules</SectionHeader>
      <ListSection footnote={moduleRulesFootnote(canManage)}>
        <NumberRow
          label={SERVICE_RULES_COPY.rate.label}
          suffix={SERVICE_RULES_COPY.rate.suffix}
          hint={serviceRateHint(servicePointsForDuration(180, rate), rate)}
          value={rate}
          min={1}
          max={POINTS_ADJUSTMENT_MAX}
          editable={canManage}
          onSave={(next) =>
            patch({ service: { minutes_per_point: next ?? rate } })
          }
        />
        {proofWorkflow ? (
          <ListRow
            label={SERVICE_RULES_COPY.proof.label}
            description={proofFailed ?? SERVICE_RULES_COPY.proof.hint}
            descriptionTone={proofFailed ? "destructive" : "default"}
            trailing={
              <Toggle
                value={proofWorkflow.enabled === true}
                disabled={!canManage || proofSaving}
                accessibilityLabel={SERVICE_RULES_COPY.proof.label}
                onValueChange={(enabled) => {
                  setProofFailed(null);
                  setProofSaving(true);
                  patch({ workflows: [{ key: "wf_hours_receipt", enabled }] })
                    .catch((error: unknown) =>
                      setProofFailed(
                        errorCopy(error, "It wasn't saved. Try again."),
                      ),
                    )
                    .finally(() => setProofSaving(false));
                }}
              />
            }
          />
        ) : null}
      </ListSection>
    </>
  );
}
