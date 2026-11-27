import { MEMBER_ORDER_NUMBER_MAX, parseOrderNumber } from "@repo/validation";
import { moveId } from "@repo/validation";
import { memberLabel } from "./display-names";
import {
  fraternalOrderComparator,
  type FraternalOrderMember,
} from "./fraternal-order";
import type { PledgeClassAssignment } from "./use-pledge-classes";

/** One member in the class editor: who, and the number their place gives them. */
export type ClassEditorRow = {
  memberId: string;
  name: string;
  /** The order number's text, or "" for none. */
  number: string;
};

/**
 * The rows' numbers after the rows were put in a new order. The numbers
 * follow the list (#5738): there is no number to type in the class editor.
 *
 * The pool dealt out, lowest first down the list, is the numbers the rows
 * already hold plus, for each row without one, the next number after the
 * highest. A chapter that numbers everyone chapter-wide (a roll or bond
 * number) keeps the numbers this class holds, 41 to 52 say, and only who holds
 * which changes; a class with no numbers yet is numbered 1 to n, since an
 * order the officer chose can only be saved as numbers. A number past
 * `MEMBER_ORDER_NUMBER_MAX` is left out, so its row gets none.
 */
export function renumberRows(
  rows: readonly ClassEditorRow[],
): ClassEditorRow[] {
  const held = rows
    .map((row) => parseOrderNumber(row.number))
    .filter((value): value is number => typeof value === "number");
  let next = Math.max(0, ...held);
  const fresh = Array.from({ length: rows.length - held.length }, () => ++next);
  const dealt = [...held, ...fresh]
    .filter((value) => value <= MEMBER_ORDER_NUMBER_MAX)
    .sort((a, b) => a - b);
  return rows.map((row, index) => ({
    ...row,
    number: dealt[index] === undefined ? "" : String(dealt[index]),
  }));
}

/**
 * The rows with a member added at the end, as the newest of the class. The
 * other rows are left as they are, so adding someone never writes anyone
 * else's number, so an add changes only the member added. The
 * added member takes the next number after the highest when the class has
 * numbers, and none when it has none: a chapter that doesn't number its
 * members (#3967) never gets numbers from an add.
 */
export function addRow(
  rows: readonly ClassEditorRow[],
  added: Omit<ClassEditorRow, "number">,
): ClassEditorRow[] {
  const held = rows
    .map((row) => parseOrderNumber(row.number))
    .filter((value): value is number => typeof value === "number");
  const next = held.length > 0 ? Math.max(...held) + 1 : null;
  const number =
    next !== null && next <= MEMBER_ORDER_NUMBER_MAX ? String(next) : "";
  return [...rows, { ...added, number }];
}

type SavedMember = {
  id: string;
  pledge_class_id: string | null;
  order_number: number | null;
};

/**
 * What saving the class editor writes: one assignment per member whose class
 * or number changed, and nothing for a member left as they were.
 *
 * `members` is the roster as it stood when the editor opened, not the live
 * read. Only a member who was in the class then, and whose row the officer
 * took out, is removed; someone another officer added to the class meanwhile
 * is not in the editor and is left alone.
 *
 * A member taken out of the class loses the class and keeps their number, as a
 * member of a deleted class does (`spec/behavior/members.md`). Returns `null`
 * while any number is not one the API takes.
 */
export function classAssignments(
  classId: string,
  rows: readonly ClassEditorRow[],
  members: readonly SavedMember[],
): PledgeClassAssignment[] | null {
  const saved = new Map(members.map((member) => [member.id, member]));
  const kept = new Set(rows.map((row) => row.memberId));
  const assignments: PledgeClassAssignment[] = [];

  for (const row of rows) {
    const number = parseOrderNumber(row.number);
    if (number === undefined) return null;
    const before = saved.get(row.memberId);
    if (
      before &&
      before.pledge_class_id === classId &&
      before.order_number === number
    ) {
      continue;
    }
    assignments.push({
      member_id: row.memberId,
      pledge_class_id: classId,
      order_number: number,
    });
  }

  for (const member of members) {
    if (member.pledge_class_id === classId && !kept.has(member.id)) {
      assignments.push({
        member_id: member.id,
        pledge_class_id: null,
        order_number: member.order_number,
      });
    }
  }

  return assignments;
}

/*
 * Both apps' reads of the roster for the pledge class pages (#6029): web's
 * `settings-classes-tab.tsx` and the phone's `pledge-classes.tsx` and
 * `pledge-class.tsx`, so a row's name, a count and the picker's order are
 * the same on both.
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
