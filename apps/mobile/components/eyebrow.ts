import type { SignetTokens } from "@repo/theme/signet";
import { typeRole } from "@/lib/theme";

/**
 * The eyebrow: a section label above a list or a card's title. It is the
 * recipe web's `EYEBROW` (`apps/web/components/ui/typography.ts`) draws,
 * caption (12.5) at 600 in sentence case, so one module owns it on each
 * platform and the copies can't drift apart. Uppercase and tracked out 1.5
 * until #6115 (Paul, 2026-11-26: section titles "more like claude and
 * discord"). Like web's, it carries no colour: callers pair it with `muted`,
 * web's `text-muted`, the tone a section title takes under its rows.
 */
export function eyebrowStyle(tokens: SignetTokens) {
  return {
    ...typeRole({
      ...tokens.typography.role.caption,
      weight: tokens.typography.weight.semibold,
    }),
  };
}
