import { test, expect } from "@playwright/test";

async function prepareCamera(page) {
  await page.addInitScript(() => {
    localStorage.setItem("dormitory_user", JSON.stringify({ username: "manager", role: "manager" }));
    localStorage.setItem("dormitory_camera_device_bindings", JSON.stringify({ 1: "test-camera" }));
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", { value: async () => [] });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      canvas.getContext("2d").fillRect(0, 0, 320, 240);
      const stream = canvas.captureStream(5);
      window.cameraTracks = stream.getTracks();
      return stream;
    } });
  });
}

for (const kind of ["webcam", "ip_camera"]) {
  test(`${kind} scans automatically, avoids overlapping scans, and can pause and stop`, async ({ page }) => {
    await prepareCamera(page);
    const requests = [];
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/monitoring/status/") return route.fulfill({ json: { mode: "Test detector", notice: "Ready" } });
      if (path === "/api/camera-sources/") return route.fulfill({ json: [{
        id: 1, name: "Test camera", location: "Lobby", source_type: kind, is_enabled: true, has_stream_url: true,
      }] });
      if (path.endsWith("/snapshot/") || path === "/api/monitoring/detect-frame/") {
        const analyzing = kind === "webcam" || route.request().postDataJSON().detect;
        requests.push(analyzing);
        const held = requests.length === 2;
        if (held) await pending;
        return route.fulfill({ json: {
          frame: { width: 320, height: 240 }, image: "data:image/jpeg;base64,AA==",
          detections: [], faces: held ? [{ status: "unknown", box: [10, 10, 50, 50] }] : [], incidents_created: [],
        } });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto("/monitoring");
    const camera = page.locator(".camera-stream-card");
    await camera.getByRole("button", { name: "Start stream", exact: true }).click();
    await expect(camera.getByRole("button", { name: "Stop detection", exact: true })).toBeEnabled();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[0]).toBe(true);
    await page.waitForTimeout(3200);
    expect(requests.length).toBe(2);
    await camera.getByRole("button", { name: "Stop detection", exact: true }).click();
    release();
    await page.waitForTimeout(3200);
    await expect(page.getByRole("alert").filter({ hasText: "Possible unauthorized person" })).toHaveCount(0);
    if (kind === "webcam") expect(requests.length).toBe(2);
    else expect(requests.at(-1)).toBe(false);
    const beforeResume = requests.filter(Boolean).length;
    await camera.getByRole("button", { name: "Start detection", exact: true }).click();
    await expect.poll(() => requests.filter(Boolean).length).toBeGreaterThan(beforeResume);
    await camera.getByRole("button", { name: "Stop stream", exact: true }).click();
    const afterStop = requests.length;
    await page.waitForTimeout(3200);
    expect(requests.length).toBe(afterStop);
  });
}

test("registration camera waits for one face, captures automatically, and requires Save face", async ({ page }) => {
  await prepareCamera(page);
  let checks = 0;
  let saves = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/tenants/") return route.fulfill({ json: [{ id: 1, full_name: "Alex Rivera", reference: "TEN-0001", room_number: "101", has_face_photo: saves > 0, is_active: true }] });
    if (path === "/api/tenants/check-face/") {
      checks += 1;
      expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
      return route.fulfill(checks === 1
        ? { status: 400, json: { photo: ["Use a clear photo with exactly one visible face."] } }
        : { json: { face_detected: true } });
    }
    if (path === "/api/tenants/1/face-photo/") {
      saves += 1;
      return route.fulfill({ json: { has_face_photo: true } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/face-registration");
  await page.getByRole("button", { name: "Register face for Alex Rivera" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Use camera" }).click();
  await expect(dialog.getByText(/Looking for one clear face/)).toBeVisible();
  await expect(dialog.getByText("One face detected. Ready to enroll.")).toBeVisible();
  await expect(dialog.getByAltText("Tenant enrollment face")).toBeVisible();
  expect(checks).toBe(3);
  expect(saves).toBe(0);
  expect(await page.evaluate(() => window.cameraTracks.every((track) => track.readyState === "ended"))).toBe(true);
  await dialog.getByRole("button", { name: "Save face" }).click();
  await expect(page.getByRole("button", { name: "Update face for Alex Rivera" })).toBeVisible();
  expect(saves).toBe(1);
});

test("stopping a registration camera discards a pending face check", async ({ page }) => {
  await prepareCamera(page);
  let checks = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/tenants/") return route.fulfill({ json: [{ id: 1, full_name: "Alex Rivera", has_face_photo: false, is_active: true }] });
    if (path === "/api/tenants/check-face/") {
      checks += 1;
      await pending;
      return route.fulfill({ json: { face_detected: true } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/face-registration");
  await page.getByRole("button", { name: "Register face for Alex Rivera" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Use camera" }).click();
  await expect.poll(() => checks).toBe(1);
  await dialog.getByRole("button", { name: "Stop camera" }).click();
  release();
  await page.waitForTimeout(1800);
  expect(checks).toBe(1);
  await expect(dialog.getByAltText("Tenant enrollment face")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Save face" })).toBeDisabled();
});

test("registration stops checking and explains when face models are unavailable", async ({ page }) => {
  await prepareCamera(page);
  let checks = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/tenants/") return route.fulfill({ json: [{ id: 1, full_name: "Alex Rivera", has_face_photo: false, is_active: true }] });
    if (path === "/api/tenants/check-face/") {
      checks += 1;
      return route.fulfill({ status: 503, json: { detail: "Face recognition models are unavailable on this server." } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/face-registration");
  await page.getByRole("button", { name: "Register face for Alex Rivera" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Use camera" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Face recognition models are unavailable");
  await expect(dialog.getByRole("button", { name: "Use camera" })).toBeVisible();
  await page.waitForTimeout(1800);
  expect(checks).toBe(1);
  await expect(dialog.getByRole("button", { name: "Save face" })).toBeDisabled();
});
