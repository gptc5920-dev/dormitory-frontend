import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import client, { api, apiList, API_BASE, API_BASE_URL, assetUrl } from "./api.js";

globalThis.localStorage = { getItem: () => null };
globalThis.window = { location: { origin: "http://localhost:5173" } };

beforeEach(() => {
  globalThis.localStorage = { getItem: () => null };
  client.defaults.adapter = async (config) => {
    const response = await globalThis.fetch(client.getUri(config), config);
    return { data: await response.text(), status: response.status, headers: {}, config };
  };
});

test("loads all pages and preserves query filters", async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    return Response.json(url.includes("page=2")
      ? { results: [{ id: 2 }], next: null }
      : { results: [{ id: 1 }], next: `${API_BASE}/tenants/?active=true&page=2` });
  };
  assert.deepEqual(await apiList("/tenants/?active=true"), [{ id: 1 }, { id: 2 }]);
  assert.equal(urls[1], `${API_BASE}/tenants/?active=true&page=2`);
});

test("rejects pagination links outside the API", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ results: [], next: "https://example.com/api/tenants/" });
  };
  await assert.rejects(apiList("/tenants/"), /invalid pagination/);
  assert.equal(calls, 1);
});

test("rejects repeated pagination links", async () => {
  globalThis.fetch = async () => Response.json({ results: [], next: `${API_BASE}/tenants/` });
  await assert.rejects(apiList("/tenants/"), /repeated pagination/);
});

test("handles unpaginated and empty lists", async () => {
  globalThis.fetch = async () => Response.json([{ id: 3 }]);
  assert.deepEqual(await apiList("/rooms/"), [{ id: 3 }]);
  globalThis.fetch = async () => Response.json({ results: [], next: null });
  assert.deepEqual(await apiList("/rooms/"), []);
});

test("uses the local fallback and sends login JSON to the API route", async () => {
  assert.equal(API_BASE_URL, "http://127.0.0.1:8000");
  assert.equal(client.defaults.baseURL, API_BASE_URL);
  globalThis.fetch = async (url, config) => {
    assert.equal(url, "http://127.0.0.1:8000/api/auth/login/");
    assert.equal(config.method, "post");
    assert.equal(config.headers.get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(config.data), { username: "tester", password: "example" });
    return Response.json({ token: "test-token" });
  };
  assert.deepEqual(await api("/auth/login/", {
    method: "POST", body: JSON.stringify({ username: "tester", password: "example" }),
  }), { token: "test-token" });
});

test("preserves authentication and structured API errors", async () => {
  globalThis.localStorage = { getItem: () => "test-token" };
  globalThis.fetch = async (_url, config) => {
    assert.equal(config.headers.get("Authorization"), "Token test-token");
    return Response.json({ username: ["Already exists."] }, { status: 400 });
  };
  await assert.rejects(api("/users/", { method: "POST", body: "{}" }), /username: Already exists/);
});

test("preserves FormData uploads and empty responses", async () => {
  const upload = new FormData();
  upload.append("name", "camera");
  globalThis.fetch = async (_url, config) => {
    assert.equal(config.data, upload);
    assert.notEqual(config.headers.get("Content-Type"), "application/json");
    return new Response(null, { status: 204 });
  };
  assert.equal(await api("/video-jobs/", { method: "POST", body: upload }), null);
});

test("preserves cancellation and uses the backend for media", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api("/rooms/", { signal: controller.signal }), /cancelled/);
  assert.equal(assetUrl("/media/example.jpg"), "http://127.0.0.1:8000/media/example.jpg");
});
