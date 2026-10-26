import { test, expect } from "@playwright/test";

async function setup(page, { matched = false, modelError = false } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem("dormitory_user", JSON.stringify({ username: "manager", role: "manager" }));
    window.desktopWarnings = [];
    window.Notification = class {
      static permission = "granted";
      constructor(title, options) { window.desktopWarnings.push({ title, ...options }); }
    };
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/monitoring/status/") return route.fulfill({ json: {
      mode: "visual-cue heuristics and manual incidents", notice: "Manager verification is required.",
    } });
    if (path === "/api/camera-sources/") return route.fulfill({ json: [{
      id: 1, name: "Lobby camera", location: "Main entrance", source_type: "ip_camera", is_enabled: true, has_stream_url: true,
    }] });
    if (path.endsWith("/snapshot/")) return route.fulfill({ json: {
      image: "data:image/jpeg;base64,AA==", detections: [], incidents_created: [],
      faces: [{ status: matched ? "possible_match" : "unknown", tenant_name: matched ? "Alex Rivera" : null }],
      face_recognition_error: modelError ? "Face models unavailable" : null,
    } });
    return route.fulfill({ json: [] });
  });
}

test("unauthorized warning is automatic, sends a desktop notice, and stays in notification history", async ({ page }) => {
  await setup(page);
  await page.goto("/monitoring");
  await page.getByRole("button", { name: "Start stream", exact: true }).click();
  const warning = page.getByRole("alert").filter({ hasText: "Possible unauthorized person" });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Lobby camera (Main entrance)");
  await expect(warning).toContainText("registered active tenant");
  await expect.poll(() => page.evaluate(() => window.desktopWarnings.length)).toBe(1);
  expect(await page.evaluate(() => window.desktopWarnings[0].title)).toBe("Possible unauthorized person");
  await page.getByRole("button", { name: "Camera notifications, 1 unread" }).click();
  const dialog = page.getByRole("dialog", { name: "Camera notifications" });
  await expect(dialog.getByText("Possible unauthorized person", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/camera-notification-modal.png", fullPage: true });
  await dialog.getByRole("button", { name: "Mark all read" }).click();
  await expect(warning).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Rooms", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Camera notifications, 0 unread" }).click();
  await expect(page.getByRole("dialog").getByText("Possible unauthorized person", { exact: true })).toBeVisible();
});

test("reloads do not send duplicate warnings and notification history is separated by account", async ({ page }) => {
  await setup(page);
  await page.goto("/monitoring");
  await page.getByRole("button", { name: "Start stream", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Possible unauthorized person" })).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "Start stream", exact: true }).click();
  await expect(page.locator(".camera-result")).toContainText("Faces: Unknown");
  await expect(page.getByRole("alert").filter({ hasText: "Possible unauthorized person" })).toHaveCount(1);
  expect(await page.evaluate(() => window.desktopWarnings.length)).toBe(0);
  await page.evaluate(() => localStorage.setItem("dormitory_user", JSON.stringify({ username: "other-manager", role: "manager" })));
  // Replace the login initializer so the other account remains selected on reload.
  await page.addInitScript(() => localStorage.setItem("dormitory_user", JSON.stringify({ username: "other-manager", role: "manager" })));
  await page.goto("/rooms");
  await expect(page.getByRole("button", { name: "Camera notifications, 0 unread" })).toBeVisible();
  await page.getByRole("button", { name: "Camera notifications, 0 unread" }).click();
  await expect(page.getByRole("dialog").getByText("No camera notifications yet.")).toBeVisible();
});

for (const options of [{ matched: true }, { modelError: true }]) {
  test(`${options.matched ? "matched faces" : "model failures"} do not raise unauthorized warnings`, async ({ page }) => {
    await setup(page, options);
    await page.goto("/monitoring");
    await page.getByRole("button", { name: "Start stream", exact: true }).click();
    await expect(page.locator(".camera-result")).toContainText("Faces:");
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(await page.evaluate(() => window.desktopWarnings.length)).toBe(0);
  });
}

test("detector information appears in a modal and fits mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await setup(page);
  await page.goto("/monitoring");
  await expect(page.getByText("visual-cue heuristics and manual incidents", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Detection details", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Detection details" });
  await expect(dialog.getByText("visual-cue heuristics and manual incidents", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Manager verification is required.", { exact: true })).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: "test-results/detection-details-mobile.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("model failures from a live scan update capability details without stopping preview", async ({ page }) => {
  await setup(page);
  const model = {
    mode: "Trained object and smoke/fire detection", notice: "Manager verification is required.",
    capabilities: {
      bottle: { ready: true, detail: "Bottle contents are unknown." },
      smoke: { ready: true, detail: "Requires two consecutive scans." },
      possible_drinking: { ready: true, detail: "Alcohol must be confirmed by staff." },
    },
  };
  await page.route("**/api/monitoring/status/", route => route.fulfill({ json: model }));
  await page.route("**/api/camera-sources/1/snapshot/", route => route.fulfill({ json: {
    image: "data:image/jpeg;base64,AA==", detections: [], incidents_created: [], faces: [],
    model: { ...model, capabilities: { ...model.capabilities,
      bottle: { ready: false, detail: "Object inference failed." },
      possible_drinking: { ready: false, detail: "Bottle detection is required." },
    } },
  } }));
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/monitoring");
  await expect(page.getByText("Bottle detection ready", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start stream", exact: true }).click();
  await expect(page.getByText("Check detection setup", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop stream", exact: true })).toBeVisible();
  await expect(page.getByText("Object inference failed.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Detection details", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Detection details" });
  await expect(dialog.getByText("Object inference failed.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Bottle detection", exact: true }).getByText("Unavailable", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Smoke detection", exact: true }).getByText("Ready", { exact: true })).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(320);
});
