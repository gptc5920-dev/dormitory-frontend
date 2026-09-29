import { test, expect } from "@playwright/test";

test("camera wall runs two webcams and an IP camera independently", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("dormitory_user", JSON.stringify({ username: "manager", role: "manager" }));
    localStorage.setItem("dormitory_camera_device_bindings", JSON.stringify({ 1: "cam-east", 2: "cam-west" }));
    window.openedCameras = [];
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async ({ video }) => {
      window.openedCameras.push(video.deviceId.exact);
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      canvas.getContext("2d").fillRect(0, 0, 320, 240);
      return canvas.captureStream(1);
    } });
  });
  let ipRequests = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/camera-sources/") return route.fulfill({ json: [
      { id: 1, name: "East webcam", location: "East", source_type: "webcam", is_enabled: true },
      { id: 2, name: "West webcam", location: "West", source_type: "webcam", is_enabled: true },
      { id: 3, name: "Lobby IP camera", location: "Lobby", source_type: "ip_camera", is_enabled: true, has_stream_url: true },
    ] });
    if (path === "/api/camera-sources/3/snapshot/") {
      ipRequests += 1;
      return route.fulfill({ json: { image: "data:image/jpeg;base64,AA==", detections: [], faces: [], incidents_created: [] } });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/camera-wall");
  await page.getByRole("button", { name: "Start all", exact: true }).click();
  const tiles = page.locator(".camera-wall-tile");
  await expect(tiles).toHaveCount(3);
  await expect(tiles.locator(".camera-wall-live")).toHaveCount(3);
  expect((await page.evaluate(() => window.openedCameras)).sort()).toEqual(["cam-east", "cam-west"]);
  expect(ipRequests).toBeGreaterThanOrEqual(1);

  await tiles.filter({ hasText: "East webcam" }).getByRole("button", { name: "Stop" }).click();
  await expect(tiles.filter({ hasText: "East webcam" }).locator(".camera-wall-live")).toHaveCount(0);
  await expect(tiles.locator(".camera-wall-live")).toHaveCount(2);
  await page.getByRole("button", { name: "Stop all", exact: true }).click();
  await expect(tiles.locator(".camera-wall-live")).toHaveCount(0);
});

test("camera setup assigns a different browser device to each stream", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("dormitory_user", JSON.stringify({ username: "manager", role: "manager" }));
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", { value: async () => [
      { kind: "videoinput", deviceId: "cam-east", label: "East camera" },
      { kind: "videoinput", deviceId: "cam-west", label: "West camera" },
    ] });
  });
  const sources = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/monitoring/status/") return route.fulfill({ json: { mode: "Test detector", notice: "Ready" } });
    if (path === "/api/rooms/") return route.fulfill({ json: [] });
    if (path === "/api/camera-sources/" && route.request().method() === "POST") {
      const source = { ...route.request().postDataJSON(), id: sources.length + 1, has_stream_url: false };
      sources.push(source);
      return route.fulfill({ status: 201, json: source });
    }
    if (path === "/api/camera-sources/") return route.fulfill({ json: sources });
    return route.fulfill({ json: [] });
  });

  await page.goto("/monitoring");
  await page.getByRole("button", { name: "Set up camera" }).click();
  let setup = page.getByRole("dialog", { name: "Set up camera" });
  await expect(setup.getByLabel("Connected browser camera").locator("option")).toHaveCount(3);
  await setup.getByLabel("Camera name").fill("East stream");
  await setup.getByLabel("Location", { exact: true }).fill("East");
  await setup.getByLabel("Connected browser camera").selectOption("cam-east");
  await setup.getByRole("button", { name: "Add camera" }).click();
  await expect(setup).toHaveCount(0);

  await page.getByRole("button", { name: "Set up camera" }).click();
  setup = page.getByRole("dialog", { name: "Set up camera" });
  await expect(setup.getByLabel("Connected browser camera")).toHaveValue("cam-west");
  await expect(setup.getByLabel("Connected browser camera").locator('option[value="cam-east"]')).toHaveCount(0);
  await setup.getByLabel("Camera name").fill("West stream");
  await setup.getByLabel("Location", { exact: true }).fill("West");
  await setup.getByRole("button", { name: "Add camera" }).click();
  await expect(page.locator(".camera-stream-card")).toHaveCount(2);
});
