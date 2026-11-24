import { expect, test as base } from "@playwright/test";

/*
 * Browse the dev server as `localhost`, the hostname it was started with. Next
 * serves its client code only to that hostname and ones in `allowedDevOrigins`,
 * so from `127.0.0.1` (the config's `baseURL`) the page never hydrates: it is
 * server-rendered HTML whose permission read never runs, and the stubs below
 * would never be asked.
 */
const test = base.extend({
  baseURL: async ({ baseURL }, provide) => {
    await provide(baseURL?.replace("//127.0.0.1", "//localhost"));
  },
});

/**
 * The channel list keeps room for at least eight rows at 1024×768 (#5946),
 * asserted rather than eyeballed.
 *
 * `spec/ui/web-dashboard/README.md` § Responsive contract: from `lg` up the
 * sidebar holds the fixed rows (New, Search, the five homes, More), then the
 * chapter's channels in whatever height is left, then the member at the
 * foot. Paul asked for channels "always visible"; every fixed row added is
 * 36px taken from the list, and this test is what stops the rows growing
 * back into it one "just one more row" at a time. It replaced #2946's test
 * that the twelve-row nav fit without scrolling.
 *
 * **Why this harness is the worst case.** It runs with no session (see
 * `responsive-floor.spec.ts`), seeds an active chapter, and answers the
 * permission read with the owner's `*`, so every permission-gated row shows.
 * The current-chapter read is held unanswered, so the module gate stays open
 * (`isNavItemVisible`) and every module row shows too, More included: more
 * rows than any single seeded role sees, the President included.
 *
 * It measures the room the list is given rather than counting drawn rows:
 * the list needs a signed-in chat, which this sessionless harness has none
 * of. A row is 32px (`channel-list.tsx`) and a category heading about 28px,
 * so eight rows under one heading need 284px.
 *
 * Deliberately NOT a screenshot: it compares two integers, so it cannot drift
 * with a Chromium revision.
 */

const WIDTH = 1024;
const HEIGHT = 768;
const CHANNEL_ROW = 32;
const CATEGORY_HEADING = 28;
const MIN_ROWS = 8;

test("the sidebar keeps eight channel rows in view at 1024×768 with every row showing", async ({
  page,
}) => {
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "frapp-active-chapter",
      JSON.stringify({ state: { activeChapterId: "nav-fit" }, version: 0 }),
    );
  });
  await page.route("**/v1/users/me/permissions", (route) =>
    route.fulfill({ json: { permissions: ["*"] } }),
  );
  // Never answered: an unresolved chapter read is what keeps every module row
  // in the list. It also rules out `networkidle`, which this request blocks.
  await page.route("**/v1/chapters/current", () => new Promise<void>(() => {}));
  await page.goto("/events");
  await page.waitForLoadState("load");
  await page.evaluate(() => document.fonts.ready);

  // Same guard as the floor suite: a redirect to `/sign-in` would measure a
  // page with no sidebar and pass vacuously.
  await expect(page).toHaveURL(/\/events\/?$/);

  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();
  // If either stub above ever stops reaching the sidebar, rows go missing and
  // the test says so instead of passing on a shorter list. Directory needs
  // the permissions stub; More holds module rows, which a failed chapter
  // read would switch off.
  await expect(nav.getByRole("link", { name: "Directory" })).toBeVisible();
  await expect(nav.getByRole("button", { name: /More/ })).toBeVisible();

  const room = await page
    .locator("[data-sidebar-channels]")
    .evaluate((el) => el.getBoundingClientRect().height);
  const need = MIN_ROWS * CHANNEL_ROW + CATEGORY_HEADING;

  expect(
    room,
    `The channel list gets ${Math.round(room)}px at ${WIDTH}×${HEIGHT}, under ` +
      `the ${need}px eight rows need. Each fixed row costs 36px of the list. ` +
      "Find the new row a home inside an existing one (a page, or the " +
      "member's menu) — spec/ui/web-dashboard/README.md § Navigation map.",
  ).toBeGreaterThanOrEqual(need);
});
