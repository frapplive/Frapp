import type { CustomFieldType } from "@repo/validation";
import {
  CircleDotGlyph,
  DecimalGlyph,
  HashGlyph,
  PhoneGlyph,
  ToggleGlyph,
  TypeGlyph,
} from "@/components/settings-glyphs";

/**
 * A member field's type as a glyph (#6029): at the start of its row on
 * Member fields, and beside each answer in its page's Type picker.
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
      return <HashGlyph color={color} />;
    case "decimal":
      return <DecimalGlyph color={color} />;
    case "phone":
      return <PhoneGlyph color={color} />;
    case "select":
      return <CircleDotGlyph color={color} />;
    case "boolean":
      return <ToggleGlyph color={color} />;
  }
}
