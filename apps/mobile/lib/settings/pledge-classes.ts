import {
  fraternalOrderComparator,
  renumberRows,
  type ClassEditorRow,
  type FraternalOrderMember,
} from "@repo/hooks";
import { memberLabel } from "@repo/hooks/display-names";
import { moveId } from "@repo/validation";

/**
 * The rules behind the phone's pledge class pages (#6029): Chapter settings →
 * Pledge class (`app/(app)/pledge-classes.tsx`) and one class's page
 * (`app/(app)/pledge-class.tsx`). The class editor's own rules (numbers that
 * follow the list, what Save writes) are shared with web in
 * `@repo/hooks/pledge-class-editor`; these are the phone's reads of them.
 */

/** A roster member as these pages read one. */
export type ClassMember = FraternalOrderMember & {
  id: string;
  pledge_class_id: string | null;
  order_number: number | null;
};

/** The name a member's row shows. */
export function classMemberName(member: ClassMember): string {
  return memberLabel(member.display_name, member.user_id);
}

/** How many members each class holds, by class id. */
export function classMemberCounts(
  members: readonly { pledge_class_id?: string | null }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const member of members) {
    const id = member.pledge_class_id;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** A class's members as editor rows, in the order the Directory lists them. */
export function classRowsOf(
  members: readonly ClassMember[],
  classId: string,
  classes: readonly { id: string }[],
): ClassEditorRow[] {
  return members
    .filter((member) => member.pledge_class_id === classId)
    .sort(fraternalOrderComparator(classes))
    .map((member) => ({
      memberId: member.id,
      name: classMemberName(member),
      number: member.order_number === null ? "" : String(member.order_number),
    }));
}

/** One row a place up or down, the numbers following; `null` at an end. */
export function moveClassRow(
  rows: readonly ClassEditorRow[],
  memberId: string,
  by: -1 | 1,
): ClassEditorRow[] | null {
  const order = moveId(
    rows.map((row) => row.memberId),
    memberId,
    by,
  );
  if (!order) return null;
  const byId = new Map(rows.map((row) => [row.memberId, row]));
  return renumberRows(order.map((id) => byId.get(id)!));
}

/** A member the picker offers, and the class they'd leave ("Moves from X"). */
export type AddableMember = {
  member: ClassMember;
  name: string;
  movesFrom: string | null;
};

/**
 * Everyone the class's "Add a member" offers: members in no class first,
 * since a new class is usually made of them, then members of another class,
 * each by name, as web's picker lists them.
 */
export function addableClassMembers(
  members: readonly ClassMember[],
  inDraft: ReadonlySet<string>,
  classNames: ReadonlyMap<string, string>,
): AddableMember[] {
  return members
    .filter((member) => !inDraft.has(member.id))
    .map((member) => {
      const from = member.pledge_class_id
        ? (classNames.get(member.pledge_class_id) ?? null)
        : null;
      return {
        member,
        name: classMemberName(member),
        movesFrom: from,
        inClass: member.pledge_class_id !== null,
      };
    })
    .sort(
      (a, b) =>
        Number(a.inClass) - Number(b.inClass) || a.name.localeCompare(b.name),
    )
    .map(({ member, name, movesFrom }) => ({ member, name, movesFrom }));
}

/** "Moves from Alpha", under a picker row for a member of another class. */
export function movesFromLabel(className: string): string {
  return `Moves from ${className}`;
}
