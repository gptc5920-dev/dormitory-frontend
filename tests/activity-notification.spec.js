import { test, expect } from "@playwright/test";

const incident = {
  id: 31, reference: "INC-2026-0031", incident_type: "possible_fire", status: "new",
  details: "Possible fire visual cue; manager review required.", source_display: "Lobby camera",
  occurred_at: "2026-09-29T12:00:00Z", snapshot: "", room_number: null,
};

test("a new IP camera incident notifies once and opens the review record", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dormitory_user", JSON.stringify({ username: "manager", role: "manager" })));
  let incidentSent = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/monitoring/status/") return route.fulfill({ json: { mode: "Test detector", notice: "Ready" } });
    if (path === "/api/rooms/" || path === "/api/tenants/") return route.fulfill({ json: [] });
    if (path === "/api/camera-sources/") return route.fulfill({ json: [{
      id: 1, name: "Lobby camera", location: "Lobby", source_type: "ip_camera", is_enabled: true, has_stream_url: true,
    }] });
    if (path === "/api/camera-sources/1/snapshot/") {
      const analyzing = route.request().postDataJSON().detect;
      const created = analyzing && !incidentSent ? [incident] : [];
      if (created.length) incidentSent = true;
      return route.fulfill({ json: { image: "data:image/jpeg;base64,AA==", detections: [], faces: [], incidents_created: created } });
    }
    if (path === "/api/incidents/31/") return route.fulfill({ json: incident });
    if (path === "/api/incidents/") return route.fulfill({ json: [incident] });
    return route.fulfill({ json: [] });
  });

  await page.goto("/monitoring");
  const camera = page.locator(".camera-stream-card");
  await camera.getByRole("button", { name: "Start stream" }).click();
  await camera.getByRole("button", { name: "Start detection" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "Camera activity needs review" });
  await expect(alert).toHaveCount(1);
  await expect(alert).toContainText("possible fire");
  await expect(alert).toContainText("Lobby camera");
  await alert.getByRole("link", { name: "Review incident" }).click();
  await expect(page.getByRole("dialog", { name: "Review INC-2026-0031" })).toBeVisible();
});

test("a new webcam incident raises a camera activity notification", async ({ page }) => {
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
      frame: { width: 320, height: 240 }, detections: [], faces: [], incidents_created: [incident],
    } });
    return route.fulfill({ json: [] });
  });

  await page.goto("/monitoring");
  const camera = page.locator(".camera-stream-card");
  await camera.getByRole("button", { name: "Start stream" }).click();
  await camera.getByRole("button", { name: "Start detection" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Camera activity needs review" })).toContainText("West webcam");
});
