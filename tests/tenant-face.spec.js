import { test, expect } from "@playwright/test";
import { Buffer } from "node:buffer";

test("enrolling a tenant uploads the selected face photo", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dormitory_user", JSON.stringify({ username: "manager", role: "manager" })));
  let tenant = null;
  let facePosted = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/rooms/") return route.fulfill({ json: [{ id: 1, number: "101", available_beds: 2 }] });
    if (path === "/api/tenants/check-face/") return route.fulfill({ json: { face_detected: true } });
    if (path === "/api/tenants/" && route.request().method() === "POST") {
      tenant = { ...route.request().postDataJSON(), id: 7, full_name: "Alex Rivera", reference: "TEN-0007", room_number: "101", has_face_photo: false };
      return route.fulfill({ status: 201, json: tenant });
    }
    if (path === "/api/tenants/7/face-photo/" && route.request().method() === "POST") {
      facePosted = route.request().headers()["content-type"].includes("multipart/form-data") && route.request().postData().includes("face.png");
      tenant.has_face_photo = true;
      return route.fulfill({ json: { has_face_photo: true } });
    }
    if (path === "/api/tenants/") return route.fulfill({ json: tenant ? [tenant] : [] });
    return route.fulfill({ json: [] });
  });

  await page.goto("/tenants");
  await page.getByRole("button", { name: "Enroll tenant" }).click();
  const dialog = page.getByRole("dialog", { name: "Enroll tenant" });
  await dialog.getByLabel("First name").fill("Alex");
  await dialog.getByLabel("Last name").fill("Rivera");
  await dialog.getByLabel("Room").selectOption("1");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9d4JcAAAAASUVORK5CYII=", "base64");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "face.png", mimeType: "image/png", buffer: png });
  await expect(dialog.getByAltText("Tenant enrollment face")).toBeVisible();
  await expect(dialog.getByText("One face detected. Ready to enroll.")).toBeVisible();
  await dialog.getByRole("button", { name: "Save tenant" }).click();
  await expect(dialog).toHaveCount(0);
  expect(facePosted).toBe(true);
  await expect(page.getByText("Alex Rivera")).toBeVisible();
});

test("each tenant has a direct face enrollment action", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dormitory_user", JSON.stringify({ username: "manager", role: "manager" })));
  const tenants = [
    { id: 1, full_name: "Alex Rivera", reference: "TEN-0001", room_number: "101", has_face_photo: false, is_active: true },
    { id: 2, full_name: "Sam Lee", reference: "TEN-0002", room_number: "102", has_face_photo: false, is_active: true },
  ];
  const enrolled = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/tenants/") return route.fulfill({ json: tenants });
    if (path === "/api/rooms/") return route.fulfill({ json: [] });
    if (path === "/api/tenants/check-face/") return route.fulfill({ json: { face_detected: true } });
    const face = path.match(/^\/api\/tenants\/(\d+)\/face-photo\/$/);
    if (face && route.request().method() === "POST") {
      enrolled.push(Number(face[1]));
      tenants.find((tenant) => tenant.id === Number(face[1])).has_face_photo = true;
      return route.fulfill({ json: { has_face_photo: true } });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/tenants");
  for (const tenant of tenants) {
    await page.getByRole("button", { name: `Enroll face for ${tenant.full_name}` }).click();
    const dialog = page.getByRole("dialog", { name: `Enroll face: ${tenant.full_name}` });
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "face.png", mimeType: "image/png", buffer: Buffer.from("photo"),
    });
    await expect(dialog.getByText("One face detected. Ready to enroll.")).toBeVisible();
    await dialog.getByRole("button", { name: "Save face" }).click();
    await expect(dialog).toHaveCount(0);
  }
  expect(enrolled).toEqual([1, 2]);
});
