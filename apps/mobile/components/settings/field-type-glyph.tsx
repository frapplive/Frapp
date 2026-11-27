import type { CustomFieldType } from "@repo/validation";
import {
  HashGlyph,
  ListGlyph,
  PhoneGlyph,
  ToggleLeftGlyph,
  TypeGlyph,
} from "@/components/settings-glyphs";

/**
 * A member field's type as a glyph (#6029): at the start of its row on
 * Member fields, and beside each answer in its page's Type picker. The same
 * Lucide glyph web's `TYPE_ICON` draws (`settings-fields-tab.tsx`).
 */
export function FieldTypeGlyph({
  type,
  color,
}: {
  type: CustomFieldType;
  color: string;
}) {
  switch (type) {
    case "text":
      return <TypeGlyph color={color} />;
    case "number":
    case "decimal":
      return <HashGlyph color={color} />;
    case "phone":
      return <PhoneGlyph color={color} />;
    case "select":
      return <ListGlyph color={color} />;
    case "boolean":
      return <ToggleLeftGlyph color={color} />;
  }
}
