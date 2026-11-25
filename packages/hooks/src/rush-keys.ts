/**
 * The chat card's candidate read keys (`useRushCandidate`), apart from
 * `use-rush.ts` so the pipeline's bid writes can refresh a card's read
 * without the two hook modules importing each other.
 */
export const rushKeys = {
  all: ["rush"] as const,
  detail: (chapterId: string | null, id: string) =>
    ["rush", chapterId, "detail", id] as const,
};
