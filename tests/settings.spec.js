import { test, expect } from "@playwright/test";

const initialAccount = {
  id: 8, username: "manager", first_name: "Alex", last_name: "Tan",
  email: "alex@example.com", role: "manager", is_active: true, desktop_alerts: true,
};

async function mockSettings(page, { failLoad = false, failSave = false } = {}) {
  let account = { ...initialAccount };
  const updates = [];
  await page.addInitScript((user) => {
    if (!localStorage.getItem("dormitory_user")) {
      localStorage.setItem("dormitory_user", JSON.stringify(user));
      localStorage.setItem("dormitory_token", "settings-test-token");
    }
    window.desktopNotifications = [];
    class MockNotification {
      static permission = "granted";
      constructor(title) { window.desktopNotifications.push(title); }
    }
    Object.defineProperty(window, "Notification", { value: MockNotification });
  }, initialAccount);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me/") {
      if (route.request().method() === "PATCH") {
        updates.push(route.request().postDataJSON());
        if (failSave) return route.fulfill({ status: 400, json: { email: ["Unable to save these details."] } });
        account = { ...account, ...route.request().postDataJSON() };
      } else if (failLoad) {
        return route.fulfill({ status: 503, json: { detail: "Settings are temporarily unavailable." } });
      }
      return route.fulfill({ json: account });
    }
    if (path === "/api/monitoring/status/") return route.fulfill({ json: { mode: "Test detector", notice: "Ready" } });
    if (path === "/api/camera-sources/") return route.fulfill({ json: [{
      id: 1, name: "Lobby camera", location: "Lobby", source_type: "ip_camera", is_enabled: true, has_stream_url: true,
    }] });
    if (path === "/api/camera-sources/1/snapshot/") return route.fulfill({ json: {
      image: "data:image/jpeg;base64,AA==", detections: [], faces: [], incidents_created: [{
        id: 31, incident_type: "possible_fire", status: "new", occurred_at: "2026-10-27T12:00:00Z",
      }],
    } });
    return route.fulfill({ json: [] });
  });
  return { updates, allowLoad: () => { failLoad = false; } };
}

test("profile saves to the account, updates the sidebar, reloads and resets unsaved edits", async ({ page }) => {
  const { updates } = await mockSettings(page);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  const profile = page.getByRole("region", { name: "Profile", exact: true });
  await expect(profile.getByRole("button", { name: "Save profile" })).toBeDisabled();
  await profile.getByLabel("First name").fill("Jamie");
  await profile.getByLabel("Email address").fill("jamie@example.com");
  await profile.getByRole("button", { name: "Save profile" }).click();
  await expect(profile.getByRole("status")).toHaveText("Profile saved.");
  await expect(page.locator(".sidebar-user strong")).toHaveText("Jamie");
  expect(updates).toEqual([{ first_name: "Jamie", last_name: "Tan", email: "jamie@example.com" }]);
  await page.reload();
  await expect(profile.getByLabel("First name")).toHaveValue("Jamie");
  await profile.getByLabel("First name").fill("Unsaved");
  await profile.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(profile.getByLabel("First name")).toHaveValue("Jamie");
  expect(updates).toHaveLength(1);
});

test("failed loads can retry and failed saves retain edits", async ({ page }) => {
  const { allowLoad } = await mockSettings(page, { failLoad: true, failSave: true });
  await page.goto("/settings");
  await expect(page.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByRole("button", { name: "Save profile" })).toHaveCount(0);
  allowLoad();
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByLabel("First name").fill("Unsaved");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to save these details");
  await expect(page.getByLabel("First name")).toHaveValue("Unsaved");
  await expect(page.locator(".sidebar-user strong")).toHaveText("Alex");
});

test("password errors retain the session and success signs out with a confirmation", async ({ page }) => {
  await mockSettings(page);
  let passwordRequests = 0;
  await page.route("**/api/auth/change-password/", async (route) => {
    passwordRequests += 1;
    expect(route.request().postDataJSON()).toEqual({
      current_password: "Original123!", new_password: "ChangedSecure456!", confirm_password: "ChangedSecure456!",
    });
    return passwordRequests === 1
      ? route.fulfill({ status: 400, json: { current_password: ["The current password is incorrect."] } })
      : route.fulfill({ status: 204 });
  });
  await page.goto("/settings");
  await page.getByLabel("Current password", { exact: true }).fill("Original123!");
  await page.getByLabel("New password", { exact: true }).fill("ChangedSecure456!");
  await page.getByLabel("Confirm new password", { exact: true }).fill("Mismatch123!");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("The new passwords do not match.");
  expect(passwordRequests).toBe(0);
  await page.getByLabel("Confirm new password", { exact: true }).fill("ChangedSecure456!");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("current password is incorrect");
  expect(await page.evaluate(() => localStorage.getItem("dormitory_token"))).toBe("settings-test-token");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("status")).toHaveText("Password updated. Sign in with your new password.");
  expect(await page.evaluate(() => localStorage.getItem("dormitory_token"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("dormitory_user"))).toBeNull();
});

for (const desktopAlerts of [true, false]) {
  test(`desktop alerts ${desktopAlerts ? "enabled" : "disabled"} while camera alerts remain in the bell`, async ({ page }) => {
    await mockSettings(page);
    await page.goto("/settings");
    if (!desktopAlerts) {
      await page.getByLabel("Desktop camera alerts").uncheck();
      await page.getByRole("button", { name: "Save notifications" }).click();
      await expect(page.getByRole("status")).toHaveText("Notification preference saved.");
      await page.reload();
      await expect(page.getByLabel("Desktop camera alerts")).not.toBeChecked();
    }
    await page.getByRole("link", { name: "Monitoring", exact: true }).click();
    await page.locator(".camera-stream-card").getByRole("button", { name: "Start stream", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Camera activity needs review" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.desktopNotifications.length)).toBe(desktopAlerts ? 1 : 0);
    const stored = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith("dormitory_camera_alerts:"))?.[1]);
    expect(JSON.parse(stored)[0].title).toBe("Camera activity needs review");
  });
}

test("settings forms fit mobile and settings is reachable in mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSettings(page);
  await page.goto("/monitoring");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/settings-mobile.png", fullPage: true });
});
