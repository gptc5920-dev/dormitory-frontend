import { test, expect } from "@playwright/test";

test("an unrecognized face raises one dismissible notification during a continuous scan", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dormitory_user", JSON.stringify({ username: "manager", role: "manager" })));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/monitoring/status/") return route.fulfill({ json: { mode: "Test detector", notice: "Ready" } });
    if (path === "/api/rooms/") return route.fulfill({ json: [] });
    if (path === "/api/camera-sources/") return route.fulfill({ json: [{
      id: 1, name: "Lobby camera", location: "Lobby", source_type: "ip_camera", is_enabled: true, has_stream_url: true,
    }] });
    if (path === "/api/camera-sources/1/snapshot/") return route.fulfill({ json: {
      image: "data:image/jpeg;base64,AA==", detections: [], faces: [{ status: "unknown" }], incidents_created: [],
    } });
    return route.fulfill({ json: [] });
  });

  await page.goto("/monitoring");
  const camera = page.locator(".camera-stream-card");
  await camera.getByRole("button", { name: "Start stream" }).click();
  await camera.getByRole("button", { name: "Start detection" }).click();
  const alerts = page.getByRole("alert").filter({ hasText: "Unrecognized face detected" });
  await expect(alerts).toHaveCount(1);
  await expect(alerts.first()).toContainText("Lobby camera");
  await page.waitForTimeout(3500);
  await expect(alerts).toHaveCount(1);
  await alerts.first().getByRole("button", { name: "Dismiss unrecognized face notification" }).click();
  await expect(alerts).toHaveCount(0);
});

test("a browser webcam scan also raises an unrecognized-face notification", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("dormitory_user", JSON.stringify({ username: "manager", role: "manager" }));
    localStorage.setItem("dormitory_camera_device_bindings", JSON.stringify({ 2: "test-camera" }));
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", { value: async () => [
      { kind: "videoinput", deviceId: "test-camera", label: "USB webcam" },
    ] });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      canvas.getContext("2d").fillRect(0, 0, 320, 240);
      return canvas.captureStream(1);
    } });
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/monitoring/status/") return route.fulfill({ json: { mode: "Test detector", notice: "Ready" } });
    if (path === "/api/rooms/") return route.fulfill({ json: [] });
    if (path === "/api/camera-sources/") return route.fulfill({ json: [{
      id: 2, name: "West webcam", location: "West entrance", source_type: "webcam", is_enabled: true,
    }] });
    if (path === "/api/monitoring/detect-frame/") return route.fulfill({ json: {
      frame: { width: 320, height: 240 }, detections: [], faces: [{ status: "unknown", box: [10, 10, 50, 50] }], incidents_created: [],
    } });
    return route.fulfill({ json: [] });
  });

  await page.goto("/monitoring");
  const camera = page.locator(".camera-stream-card");
  await camera.getByRole("button", { name: "Start stream" }).click();
  await camera.getByRole("button", { name: "Start detection" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Unrecognized face detected" })).toContainText("West webcam");
});
