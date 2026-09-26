import { test, expect } from "@playwright/test";

const summary = { active_tenants: 28, available_beds: 12, pending_incidents: 3, violations_total: 2, total_beds: 40, active_rooms: 10, incidents_today: 1, verified_incidents: 2, warnings_total: 5, recent_incidents: [{ id: 1, incident_type: "possible_smoke", reference: "INC-001", room_number: "101", status: "new", occurred_at: "2026-09-18T04:00:00Z" }] };
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dormitory_user", JSON.stringify({ username: "manager", first_name: "Alex", role: "manager" })));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    let body = [];
    if (path.includes("dashboard")) body = summary;
    if (path.includes("reports")) body = { date_from: "2026-08-20", date_to: "2026-09-18", totals: { incidents: 4, warnings: 2, violations: 1 }, incidents_by_type: [{ incident_type: "possible_smoke", count: 3 }, { incident_type: "possible_fire", count: 1 }], incidents_by_status: [{ status: "new", count: 4 }], warnings_by_rule: [], violations_by_rule: [] };
    return route.fulfill({ json: body });
  });
});
for (const width of [320, 390, 768, 1024, 1440]) {
  test(`workspace fits ${width}px and reports render`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/rooms", "/reports"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText("Loading residence overview")).toHaveCount(0);
      if (path === "/reports") await expect(page.locator(".recharts-surface")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.screenshot({ path: `test-results/reports-${width}.png`, fullPage: true });
  });
}
test("mobile drawer traps focus, closes on Escape and on navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(drawer).toBeVisible();
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole("link", { name: "Rooms", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Rooms", exact: true })).toBeVisible();
});
test("room dialog fits mobile and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/rooms");
  const trigger = page.getByRole("button", { name: "Add room" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Add room" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(568);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
