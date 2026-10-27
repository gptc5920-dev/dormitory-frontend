import { test, expect } from "@playwright/test";

const incident = {
  id: 31, reference: "INC-2026-0031", incident_type: "manual", status: "new",
  details: "Noise after quiet hours", source_display: "Lobby", confidence: null,
  occurred_at: "2026-10-27T12:00:00Z", snapshot: "", room_number: null,
};

async function setupIncidents(page, { failDelete = false, waitForDelete = null } = {}) {
  let items = [{ ...incident }];
  const deletes = [];
  const queries = [];
  await page.addInitScript(() => {
    localStorage.setItem("dormitory_user", JSON.stringify({ id: 8, username: "manager", role: "manager" }));
    localStorage.setItem("dormitory_token", "test-token");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/incidents/31/") {
      if (route.request().method() === "DELETE") {
        deletes.push(route.request().url());
        if (waitForDelete) await waitForDelete;
        if (failDelete) return route.fulfill({ status: 403, json: { detail: "You do not have permission to delete this incident." } });
        items = [];
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ json: incident });
    }
    if (url.pathname === "/api/incidents/") {
      queries.push(url.search);
      return route.fulfill({ json: items });
    }
    return route.fulfill({ json: [] });
  });
  return { deletes, queries };
}

test("deletion requires confirmation and Cancel or Escape leaves the incident intact", async ({ page }) => {
  const { deletes } = await setupIncidents(page);
  await page.goto("/incidents");
  const trigger = page.getByRole("button", { name: `Delete ${incident.reference}`, exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: `Delete ${incident.reference}?`, exact: true });
  await expect(dialog).toContainText("This cannot be undone");
  await expect(dialog).toContainText("Linked warnings and violations will be kept");
  expect(deletes).toHaveLength(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("cell", { name: incident.reference, exact: true })).toBeVisible();
  expect(deletes).toHaveLength(0);
});

test("confirming deletes the selected incident and refreshes the filtered list", async ({ page }) => {
  const { deletes, queries } = await setupIncidents(page);
  await page.goto("/incidents");
  await page.getByLabel("Incident status").selectOption("new");
  await page.getByLabel("Detection type").selectOption("manual");
  await page.getByRole("button", { name: `Delete ${incident.reference}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete incident", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: `${incident.reference} deleted.` })).toBeVisible();
  await expect(page.getByText("No incidents found", { exact: true })).toBeVisible();
  expect(deletes).toHaveLength(1);
  expect(queries.at(-1)).toContain("status=new");
  expect(queries.at(-1)).toContain("type=manual");
  await expect(page.getByLabel("Incident status")).toHaveValue("new");
  await expect(page.getByLabel("Detection type")).toHaveValue("manual");
});

test("deleting from a linked review can cancel back to review and clears its URL on success", async ({ page }) => {
  const { deletes } = await setupIncidents(page);
  await page.goto("/incidents?incident=31");
  const review = page.getByRole("dialog", { name: `Review ${incident.reference}`, exact: true });
  await review.getByRole("button", { name: "Delete incident", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(review).toBeVisible();
  expect(deletes).toHaveLength(0);
  await review.getByRole("button", { name: "Delete incident", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete incident", exact: true }).click();
  await expect(page).toHaveURL(/\/incidents$/);
  await expect(page.getByRole("status").filter({ hasText: `${incident.reference} deleted.` })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(deletes).toHaveLength(1);
});

test("failed deletion keeps the confirmation and incident and allows cancellation", async ({ page }) => {
  const { deletes } = await setupIncidents(page, { failDelete: true });
  await page.goto("/incidents");
  await page.getByRole("button", { name: `Delete ${incident.reference}`, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Delete incident", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("do not have permission");
  await expect(dialog.getByRole("button", { name: "Delete incident", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("cell", { name: incident.reference, exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(deletes).toHaveLength(1);
});

test("pending deletion blocks duplicate submissions and closing the dialog on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  let releaseDelete;
  const waitForDelete = new Promise((resolve) => { releaseDelete = resolve; });
  const { deletes } = await setupIncidents(page, { waitForDelete });
  await page.goto("/incidents");
  await page.getByRole("button", { name: `Delete ${incident.reference}`, exact: true }).click();
  const dialog = page.getByRole("dialog");
  const box = await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(box.y + box.height).toBeLessThanOrEqual(568);
  await page.screenshot({ path: "test-results/incident-delete-mobile.png" });
  await dialog.getByRole("button", { name: "Delete incident", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Deleting...", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  expect(deletes).toHaveLength(1);
  releaseDelete();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: `${incident.reference} deleted.` })).toBeVisible();
});
