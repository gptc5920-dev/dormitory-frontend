import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9d4JcAAAAASUVORK5CYII=";
const faceFixture = readFileSync(new URL("../../backend/tenants/testdata/face.jpg", import.meta.url));
const photo = (name) => ({ name, mimeType: "image/jpeg", buffer: faceFixture });

async function setup(page, { saved = false, reject = false } = {}) {
  await page.addInitScript(() => localStorage.setItem("dormitory_user", JSON.stringify({ username: "manager", role: "manager" })));
  const requests = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/tenants/") return route.fulfill({ json: [{ id: 1, full_name: "Alex Rivera", reference: "TEN-0001", room_number: "101", has_face_photo: saved, face_photo_count: saved ? 2 : 0, is_active: true }] });
    if (path === "/api/tenants/check-face/") return route.fulfill(reject && request.postData().includes("bad.jpg")
      ? { status: 400, json: { photo: ["Use a clear photo with exactly one visible face."] } }
      : { json: { face_detected: true } });
    if (path === "/api/tenants/1/face-photo/") {
      if (request.method() === "GET") return route.fulfill({ json: { image, images: [{ id: 11, image }, { id: 12, image }] } });
      requests.push({ method: request.method(), body: request.postData() });
      return request.method() === "DELETE" ? route.fulfill({ status: 204 }) : route.fulfill({ json: { has_face_photo: true } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/tenants");
  await page.getByRole("button", { name: `${saved ? "Update" : "Enroll"} face for Alex Rivera` }).click();
  return requests;
}

test("uploads multiple angles together and adds another selection", async ({ page }) => {
  const requests = await setup(page);
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles([photo("front.jpg"), photo("left.jpg"), photo("right.jpg")]);
  await expect(dialog.getByText("One face detected. Ready to enroll.")).toHaveCount(3);
  await dialog.locator('input[type="file"]').setInputFiles(photo("distance.jpg"));
  await expect(dialog.getByText("One face detected. Ready to enroll.")).toHaveCount(4);
  await expect(dialog.getByText("Face photos · 4/10")).toBeVisible();
  await page.screenshot({ path: "test-results/multi-face-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/multi-face-mobile.png", fullPage: true });
  await dialog.getByRole("button", { name: "Save face" }).click();
  await expect(dialog).toHaveCount(0);
  expect(requests).toHaveLength(1);
  for (const name of ["front.jpg", "left.jpg", "right.jpg", "distance.jpg"]) expect(requests[0].body).toContain(`filename="${name}"`);
  expect(requests[0].body.match(/name="photo"/g)).toHaveLength(4);
});

test("keeps existing angles while adding a new one and removing a saved angle", async ({ page }) => {
  const requests = await setup(page, { saved: true });
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".tenant-face-sample")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Remove photo", exact: true }).click();
  await dialog.locator('input[type="file"]').setInputFiles(photo("right.jpg"));
  await expect(dialog.getByRole("button", { name: "Save face" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Save face" }).click();
  await expect(dialog).toHaveCount(0);
  expect(requests[0].body).toContain("[12]");
  expect(requests[0].body).toContain('filename="right.jpg"');
  expect(requests[0].body).not.toContain("[11");
});

test("an invalid angle blocks saving until it is removed", async ({ page }) => {
  const requests = await setup(page, { reject: true });
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles([photo("front.jpg"), photo("bad.jpg")]);
  await expect(dialog.getByRole("alert")).toContainText("exactly one visible face");
  await expect(dialog.getByRole("button", { name: "Save face" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Remove photo 2", exact: true }).click();
  await dialog.getByRole("button", { name: "Save face" }).click();
  await expect(dialog).toHaveCount(0);
  expect(requests[0].body).toContain('filename="front.jpg"');
  expect(requests[0].body).not.toContain('filename="bad.jpg"');
});

test("rejects selections over the gallery limit and resets pending photos", async ({ page }) => {
  await setup(page);
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles(Array.from({ length: 11 }, (_, index) => photo(`angle-${index}.jpg`)));
  await expect(dialog.getByRole("alert")).toContainText("up to 10 face photos");
  await expect(dialog.locator(".tenant-face-sample")).toHaveCount(0);
  await dialog.locator('input[type="file"]').setInputFiles([photo("front.jpg"), photo("left.jpg")]);
  await expect(dialog.getByRole("button", { name: "Save face" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(dialog.locator(".tenant-face-sample")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Save face" })).toBeDisabled();
});
