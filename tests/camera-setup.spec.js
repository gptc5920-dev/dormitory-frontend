import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("dormitory_user", JSON.stringify({ username: "manager", role: "manager" }));
    let allowed = false;
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", { value: async () => allowed
      ? [{ kind: "videoinput", deviceId: "test-camera", label: "USB webcam" }]
      : [{ kind: "videoinput", deviceId: "", label: "" }] });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
      allowed = true;
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      canvas.getContext("2d").fillRect(0, 0, 320, 240);
      return canvas.captureStream(1);
    } });
  });
  let sources = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/monitoring/status/") return route.fulfill({ json: { mode: "Test detector", notice: "Test camera setup" } });
    if (path === "/api/rooms/") return route.fulfill({ json: [{ id: 1, number: "101" }] });
    if (path.startsWith("/api/camera-sources/")) {
      if (path.endsWith("/snapshot/")) return route.fulfill({ json: { image: "data:image/jpeg;base64,AA==", detections: [], incidents_created: [] } });
      const method = route.request().method();
      if (method === "POST" || method === "PATCH") {
        const source = { ...sources[0], ...route.request().postDataJSON(), id: 1 };
        if (source.stream_url) source.has_stream_url = true;
        delete source.stream_url;
        sources = [source];
        return route.fulfill({ status: method === "POST" ? 201 : 200, json: source });
      }
      return route.fulfill({ json: sources });
    }
    return route.fulfill({ json: [] });
  });
});

test("Wi-Fi CCTV can be saved, previewed and edited without browser permission", async ({ page }) => {
  await page.goto("/monitoring");
  await page.getByRole("button", { name: "Set up camera", exact: true }).click();
  const setup = page.getByRole("dialog");
  await setup.getByLabel("Camera type").selectOption("ip_camera");
  await setup.getByLabel("Camera name").fill("Wi-Fi entrance");
  await setup.getByLabel("Location", { exact: true }).fill("Lobby");
  await setup.getByLabel("RTSP stream URL").fill("rtsp://operator:secret@192.168.1.100:554/stream");
  await setup.getByRole("button", { name: "Add camera", exact: true }).click();
  const card = page.locator(".camera-stream-card");
  await card.getByRole("button", { name: "Start stream", exact: true }).click();
  await expect(card.getByText("Live", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Start detection", exact: true }).click();
  await expect(card.getByText("No target cues detected")).toBeVisible();
  await card.getByRole("button", { name: "Stop stream", exact: true }).click();
  await card.getByRole("button", { name: "Configure Wi-Fi entrance" }).click();
  await expect(setup.getByLabel("Camera type")).toHaveValue("ip_camera");
  await expect(setup.getByLabel("RTSP stream URL")).toHaveValue("");
  await setup.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(card.getByRole("button", { name: "Start stream", exact: true })).toBeEnabled();
});

test("discover, save, stream and reconfigure a browser camera", async ({ page }) => {
  await page.goto("/monitoring");
  await page.getByRole("button", { name: "Set up camera", exact: true }).click();
  const setup = page.getByRole("dialog");
  await expect(setup).toHaveAccessibleName("Set up camera");
  await setup.getByRole("button", { name: "Discover cameras" }).click();
  await expect(setup.getByLabel("Connected browser camera")).toHaveValue("test-camera");
  await setup.getByLabel("Camera name").fill("Entrance");
  await setup.getByLabel("Location", { exact: true }).fill("Ground floor");
  await setup.getByLabel("Associate room").selectOption("1");
  await setup.getByRole("button", { name: "Add camera", exact: true }).click();
  await expect(setup).toHaveCount(0);
  const camera = page.locator(".camera-stream-card");
  await expect(camera.getByRole("heading", { name: "Entrance" })).toBeVisible();
  await page.reload();
  await expect(camera.getByText("Ready", { exact: true })).toBeVisible();
  await camera.getByRole("button", { name: "Start stream", exact: true }).click();
  await expect(camera.getByText("Live", { exact: true })).toBeVisible();
  await camera.getByRole("button", { name: "Stop stream", exact: true }).click();
  await expect(camera.getByText("Ready", { exact: true })).toBeVisible();
  await camera.getByRole("button", { name: "Configure Entrance" }).click();
  await expect(setup).toHaveAccessibleName("Configure camera");
  await expect(setup.getByLabel("Camera name")).toHaveValue("Entrance");
  await setup.getByRole("button", { name: "Discover cameras" }).click();
  await setup.getByLabel("Camera name").fill("Main entrance");
  await setup.getByRole("button", { name: "Save changes" }).click();
  await expect(setup).toHaveCount(0);
  await expect(camera.getByRole("heading", { name: "Main entrance" })).toBeVisible();
});

test("permission failures show recovery instructions in camera setup", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      throw new DOMException("Denied", "NotAllowedError");
    } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/monitoring");
  await page.getByRole("button", { name: "Set up camera", exact: true }).click();
  const setup = page.getByRole("dialog", { name: "Set up camera" });
  await setup.getByRole("button", { name: "Discover cameras" }).click();
  await expect(setup.getByText(/Allow camera access in your browser's site settings/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("camera setup stays on the page and supports keyboard dismissal on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/monitoring");
  const trigger = page.getByRole("button", { name: "Set up camera", exact: true });
  await trigger.click();
  const setup = page.getByRole("dialog", { name: "Set up camera" });
  await expect(setup).toBeVisible();
  await expect(page).toHaveURL(/\/monitoring$/);
  const box = await setup.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    expect(await setup.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(setup).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await setup.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(setup).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
