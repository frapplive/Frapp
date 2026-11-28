import {
  anyFilterRow,
  type FilterRow,
  type FilterRowOption,
} from "./filter-rows";

/**
 * The Directory's filter rows, built once for both apps (#5739): web's
 * `FilterMenu` and the phone's `FilterSheet` list the same rows, in the same
 * order, with the same words. Role, Group, Graduation year, the chapter's
 * pledge class, Status, Phone app, then Sort and, under a standing, Period.
 *
 * A filter with nothing to offer is left out: Group while no group has
 * members, Graduation year while no member has one, the class while the
 * chapter keeps none, Phone app for a viewer without the chapter's reach, and
 * Sort while it has one order. Each app keeps its own state and option lists
 * (web's sorts carry a direction, the phone's don't); this owns the rows.
 */

/** Status's options, the same two on both apps. */
export const DIRECTORY_STATUS_OPTIONS: readonly {
  value: "active" | "pending";
  label: string;
}[] = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
];

/** One "any"-able filter: its options, its pick (`null` for any), its setter. */
type AnyFilter = {
  options: readonly FilterRowOption[];
  value: string | null;
  onChange: (value: string | null) => void;
};

export function directoryFilterRows(input: {
  role: AnyFilter;
  group: AnyFilter;
  year: AnyFilter;
  /** The chapter's word for a pledge class ("Pledge class", "Line"). */
  pledgeClass: AnyFilter & { label: string };
  status: Omit<AnyFilter, "options">;
  /** `null` for a viewer the server sends no chapter-wide reach to. */
  phoneReach: (AnyFilter & { label: string }) | null;
  sort: {
    options: readonly FilterRowOption[];
    value: string;
    /** The order that is no sort at all: the list's default. */
    defaultValue: string;
    onChange: (value: string) => void;
  };
  /** A standing's period (#5950); `null` outside a standing. */
  period: {
    options: readonly FilterRowOption[];
    value: string;
    onChange: (value: string) => void;
  } | null;
}): FilterRow[] {
  const { role, group, year, pledgeClass, status, phoneReach, sort, period } =
    input;
  return [
    anyFilterRow({ key: "role", label: "Role", anyLabel: "Any role", ...role }),
    ...(group.options.length > 0
      ? [
          anyFilterRow({
            key: "group",
            label: "Group",
            anyLabel: "Any group",
            ...group,
          }),
        ]
      : []),
    ...(year.options.length > 0
      ? [
          anyFilterRow({
            key: "year",
            label: "Graduation year",
            anyLabel: "Any year",
            ...year,
          }),
        ]
      : []),
    // Separate from graduation year: one pledge class can span several
    // (#3939, #3941).
    ...(pledgeClass.options.length > 0
      ? [anyFilterRow({ key: "class", anyLabel: "Any", ...pledgeClass })]
      : []),
    anyFilterRow({
      key: "status",
      label: "Status",
      anyLabel: "Any status",
      options: DIRECTORY_STATUS_OPTIONS,
      ...status,
    }),
    ...(phoneReach
      ? [anyFilterRow({ key: "phone-reach", anyLabel: "Any", ...phoneReach })]
      : []),
    ...(sort.options.length > 1
      ? [
          {
            key: "sort",
            label: "Sort",
            options: sort.options,
            value: sort.value,
            anyValue: sort.defaultValue,
            onChange: sort.onChange,
            isSort: true,
          },
        ]
      : []),
    // A standing ranks over a period, picked under Sort.
    ...(period
      ? [
          {
            key: "period",
            label: "Period",
            options: period.options,
            value: period.value,
            anyValue: period.value,
            onChange: period.onChange,
            isSort: true,
          },
        ]
      : []),
  ];
}
