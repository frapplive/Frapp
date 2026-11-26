/**
 * How text a member wrote is put on one line of a source: a tool's result,
 * and the source that says who is asking (`ask-tool.ts` has the rules).
 */

const FREE_TEXT_LIMIT = 300;

/** One line of member-written text: no line breaks, cut to a sane length. */
export function oneLine(text: string | null | undefined): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > FREE_TEXT_LIMIT
    ? `${flat.slice(0, FREE_TEXT_LIMIT).trimEnd()}...`
    : flat;
}

/**
 * A member's name inside a `name: fact` line. Members choose their own
 * display name, so the characters that separate a name from its fact are
 * taken out: "Jordan Lee: Treasurer" as a name would otherwise read as a
 * role the roster never gave.
 */
export function nameInLine(name: string | null | undefined): string {
  return oneLine((name ?? '').replace(/[:;.,|()[\]]+/g, ' '));
}

/**
 * What a document or minutes is, in the words beside its title (#5180):
 * "Policy, in the Bylaws folder, uploaded by Jordan Lee". Every part is text
 * an officer or a member chose, so each is written as a name is, with
 * nothing that could read as a second fact. Null when there is nothing to
 * say.
 */
export function recordFactsLine(
  facts: {
    type: string | null;
    folder: string | null;
    by: { verb: 'uploaded' | 'posted'; name: string } | null;
    fromDrive: boolean;
  } | null,
): string | null {
  if (!facts) return null;
  const type = nameInLine(facts.type);
  const folder = nameInLine(facts.folder);
  const name = facts.by ? nameInLine(facts.by.name) : '';
  const parts = [
    type || null,
    folder ? `in the ${folder} folder` : null,
    facts.fromDrive ? 'copied from Google Drive' : null,
    facts.by && name ? `${facts.by.verb} by ${name}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(', ') : null;
}
