import assert from "node:assert/strict";
import { test } from "node:test";
import { apiList } from "./api.js";

globalThis.localStorage = { getItem: () => null };
globalThis.window = { location: { origin: "http://localhost:5173" } };

test("loads all pages and preserves query filters", async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    return Response.json(url.includes("page=2")
      ? { results: [{ id: 2 }], next: null }
      : { results: [{ id: 1 }], next: "http://localhost:5173/api/tenants/?active=true&page=2" });
  };
  assert.deepEqual(await apiList("/tenants/?active=true"), [{ id: 1 }, { id: 2 }]);
  assert.equal(urls[1], "/api/tenants/?active=true&page=2");
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
  globalThis.fetch = async () => Response.json({ results: [], next: "http://localhost:5173/api/tenants/" });
  await assert.rejects(apiList("/tenants/"), /repeated pagination/);
});

test("handles unpaginated and empty lists", async () => {
  globalThis.fetch = async () => Response.json([{ id: 3 }]);
  assert.deepEqual(await apiList("/rooms/"), [{ id: 3 }]);
  globalThis.fetch = async () => Response.json({ results: [], next: null });
  assert.deepEqual(await apiList("/rooms/"), []);
});
