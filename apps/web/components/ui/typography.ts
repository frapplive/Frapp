/**
 * Type recipes shared across surfaces, in the sense `focus.ts` and
 * `duotone.tsx` are shared recipes rather than components.
 *
 * `EYEBROW` started in `components/chat/chip.ts`, where its own docstring
 * warned that "twelve copies of a four-part class string is how the eleventh
 * and the twelfth quietly become different eyebrows". The Directory & Finance
 * slice of #920 then added three more copies to the alumni filter labels — the
 * warning coming true in the same shape it predicted — so the recipe moves here
 * and both families import it. The alternative, importing a chat module into an
 * alumni screen, would have crossed a family boundary for a string that belongs
 * to neither.
 */

/**
 * The section title §2 draws above a grouped list: a sidebar category, a
 * settings group, a list's heading, a chat card's kind.
 *
 * `caption` (12.5) at 600 in sentence case, as Claude's "Pinned" and Discord's
 * "Events" draw theirs (Paul, 2026-11-26, #6115: "can we make the section
 * titles smaller? more like claude and discord"). Until then it was uppercase
 * and tracked out 0.12em. Deliberately not `font-mono`: foundations §7
 * reserves mono for numeric, status and code-like strings, and a section
 * label is a label. It carries no colour: callers pair it with `text-muted`,
 * the tone a section title takes under the rows it heads, or with the accent
 * where a page's own eyebrow calls for one.
 */
export const EYEBROW = "text-caption font-semibold";
