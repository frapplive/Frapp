import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Every route under `app/(dashboard)`, for the route walks
 * (`every-page-has-a-way-back.spec.ts`, `every-page-has-an-address.spec.ts`),
 * so a new page is checked by both without being listed anywhere.
 */

const DASHBOARD = path.resolve(__dirname, "../../app/(dashboard)");

/** Each route's path, a dynamic segment kept as written (`/meetings/[id]`). */
export function dashboardRoutes(
  dir: string = DASHBOARD,
  prefix = "",
): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...dashboardRoutes(full, `${prefix}/${name}`));
    } else if (name === "page.tsx" && !onlyRedirects(full)) {
      out.push(prefix || "/");
    }
  }
  return out;
}

/**
 * A page kept only to send old links on (`/roles` to Settings) never draws,
 * so the walks skip it. It imports Next's `redirect` or a `…Redirect` component.
 */
function onlyRedirects(file: string): boolean {
  const source = readFileSync(file, "utf8");
  return /import \{[^}]*\bredirect\b[^}]*\} from "next\/navigation"|import \{ \w+Redirect \}/.test(
    source,
  );
}
