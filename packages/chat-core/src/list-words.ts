/**
 * "a", "a or b", "a, b or c": an English list of alternatives, as the
 * composer's + menu footer and the slash palette's `/rush` row word them.
 * No Oxford comma.
 */
export function listOr(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}
