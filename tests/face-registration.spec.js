import { test, expect } from "@playwright/test";
import { Buffer } from "node:buffer";

async function setup(page, { rejectPhoto = false, tenants = null } = {}) {
  await page.addInitScript(() => localStorage.setItem("dormitory_user", JSON.stringify({ username: "manager", role: "manager" })));
  const residents = tenants ?? [
    { id: 1, full_name: "Alex Rivera", reference: "TEN-0001", room_number: "101", has_face_photo: false, is_active: true },
    { id: 2, full_name: "Sam Lee", reference: "TEN-0002", room_number: "102", has_face_photo: true, is_active: true },
  ];
  const changes = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/tenants/") return route.fulfill({ json: residents });
    if (path === "/api/tenants/check-face/") return route.fulfill(rejectPhoto
      ? { status: 400, json: { photo: ["Use a clear photo with exactly one visible face."] } }
      : { json: { face_detected: true } });
    const match = path.match(/^\/api\/tenants\/(\d+)\/face-photo\/$/);
    if (match) {
      const resident = residents.find((item) => item.id === Number(match[1]));
      if (method === "GET") return route.fulfill({ json: { image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9d4JcAAAAASUVORK5CYII=" } });
      changes.push({ method, tenant: resident.id, multipart: route.request().headers()["content-type"]?.includes("multipart/form-data") });
      resident.has_face_photo = method === "POST";
      return method === "DELETE" ? route.fulfill({ status: 204 }) : route.fulfill({ json: { has_face_photo: true } });
    }
    return route.fulfill({ json: [] });
  });
  return changes;
}

test("face registration is in navigation and saves, updates, and removes tenant faces", async ({ page }) => {
  const changes = await setup(page);
  await page.goto("/tenants");
  await page.getByRole("navigation").getByRole("link", { name: "Face registration" }).click();
  await expect(page.getByRole("heading", { name: "Face registration", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Register face for Alex Rivera" })).toBeVisible();
  await page.screenshot({ path: "test-results/face-registration-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Register face for Alex Rivera" }).click();
  const dialog = page.getByRole("dialog", { name: "Enroll face: Alex Rivera" });
  await expect(dialog.getByRole("button", { name: "Use camera" })).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles({ name: "face.jpg", mimeType: "image/jpeg", buffer: Buffer.from("photo") });
  await expect(dialog.getByText("One face detected. Ready to enroll.")).toBeVisible();
  await dialog.getByRole("button", { name: "Save face" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Face registered" })).toHaveText("Face registered for Alex Rivera.");
  await expect(page.getByRole("button", { name: "Update face for Alex Rivera" })).toBeVisible();
  expect(changes).toEqual([{ method: "POST", tenant: 1, multipart: true }]);
  await page.getByLabel("Face registration status").selectOption("unregistered");
  await expect(page.getByText("No tenants found")).toBeVisible();
  await page.getByLabel("Face registration status").selectOption("registered");
  await page.getByRole("button", { name: "Update face for Alex Rivera" }).click();
  const update = page.getByRole("dialog", { name: "Update face: Alex Rivera" });
  await expect(update.getByAltText("Tenant enrollment face")).toBeVisible();
  await update.getByRole("button", { name: "Remove photo" }).click();
  await update.getByRole("button", { name: "Save face" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Face photo removed" })).toHaveText("Face photo removed for Alex Rivera.");
  await expect(page.getByRole("button", { name: "Update face for Alex Rivera" })).toHaveCount(0);
  await page.getByLabel("Face registration status").selectOption("unregistered");
  await expect(page.getByRole("button", { name: "Register face for Alex Rivera" })).toBeVisible();
  expect(changes[1]).toMatchObject({ method: "DELETE", tenant: 1 });
});

test("invalid photos show an error and cannot be registered", async ({ page }) => {
  const changes = await setup(page, { rejectPhoto: true });
  await page.goto("/face-registration");
  await page.getByRole("button", { name: "Register face for Alex Rivera" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "bad.jpg", mimeType: "image/jpeg", buffer: Buffer.from("photo") });
  await expect(dialog.getByRole("alert")).toContainText("exactly one visible face");
  await expect(dialog.getByRole("button", { name: "Save face" })).toBeDisabled();
  expect(changes).toEqual([]);
});

test("mobile navigation exposes the module and explains how to add the first tenant", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await setup(page, { tenants: [] });
  await page.goto("/tenants");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Face registration" }).click();
  await expect(page.getByRole("heading", { name: "Face registration", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage tenants" })).toBeVisible();
  await expect(page.getByText("Adjust the filters or add a tenant from Manage tenants before registering a face.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/face-registration-mobile.png", fullPage: true });
});
