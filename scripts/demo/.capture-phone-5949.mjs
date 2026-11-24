// Phone captures for #5949's before/after page (scratch; not committed).
import { chromium } from "playwright";
const URL0 = "http://localhost:3002";
const OUT = process.argv[2];
const shots = JSON.parse(process.argv[3]);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.setDefaultTimeout(240000);
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 240000 });
await page.goto(`${URL0}/sign-in`, { waitUntil: "domcontentloaded", timeout: 300000 });
await until(() => document.body.innerText.includes("Continue with email"));
await page.getByText("Continue with email", { exact: true }).click();
await until(() => document.body.innerText.includes("Sign in with email"));
await page.locator('input[type="email"], input[inputmode="email"]').first().fill("marcus.ellison@example.com");
await page.locator('input[type="password"]').first().fill("DemoShowcase!2026");
await page.getByText("Sign in", { exact: true }).last().click();
await until(() => Boolean(document.querySelector('[aria-label^="#general"]')) || document.body.innerText.includes("Agree to the Terms to continue"));
if (await page.getByText("Agree to the Terms to continue").isVisible().catch(() => false)) {
  await page.getByRole("checkbox").first().click().catch(() => {});
  await page.getByText(/Agree and continue/).click();
}
await until(() => Boolean(document.querySelector('[aria-label^="#general"]')));
for (const [name, route, waitText] of shots) {
  await page.goto(`${URL0}${route}`, { waitUntil: "domcontentloaded" });
  if (waitText) await until((t) => document.body.innerText.includes(t), waitText).catch(() => console.log("  no", waitText));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name, page.url());
}
await browser.close();
