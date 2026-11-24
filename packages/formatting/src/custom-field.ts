import { formatPhone } from "./phone";

/**
 * How a chapter custom field's stored value reads on a profile (#581): Yes or
 * No for a boolean, a phone number formatted like the member's own Phone row
 * (#5798), the text as stored otherwise. `null` for no value. One rule for
 * the directory's More details on both apps and the member's own rows.
 */
export function formatCustomFieldValue(
  type: string,
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  if (type === "boolean") return value === "true" ? "Yes" : "No";
  if (type === "phone") return formatPhone(value);
  return value;
}
