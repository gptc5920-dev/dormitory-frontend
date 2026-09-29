import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createUnknownFaceTracker, resetUnknownFaceTracker, trackUnknownFaces } from "./unknownFaceAlerts.js";

test("alerts once for a continuous unknown face and again after a new occurrence", () => {
  const tracker = createUnknownFaceTracker();
  const unknown = [{ status: "unknown" }];
  assert.equal(trackUnknownFaces(tracker, unknown, 1_000), 1);
  assert.equal(trackUnknownFaces(tracker, unknown, 4_000), 0);
  assert.equal(trackUnknownFaces(tracker, [], 7_000), 0);
  assert.equal(trackUnknownFaces(tracker, unknown, 10_000), 0);
  assert.equal(trackUnknownFaces(tracker, [], 13_000), 0);
  assert.equal(trackUnknownFaces(tracker, [], 16_000), 0);
  assert.equal(trackUnknownFaces(tracker, unknown, 19_000), 0);
  assert.equal(trackUnknownFaces(tracker, [], 22_000), 0);
  assert.equal(trackUnknownFaces(tracker, [], 25_000), 0);
  assert.equal(trackUnknownFaces(tracker, unknown, 61_000), 1);
});

test("possible matches do not alert and stopping detection rearms the tracker", () => {
  const tracker = createUnknownFaceTracker();
  assert.equal(trackUnknownFaces(tracker, [{ status: "possible_match" }], 1_000), 0);
  assert.equal(trackUnknownFaces(tracker, [{ status: "unknown" }, { status: "unknown" }], 2_000), 2);
  resetUnknownFaceTracker(tracker);
  assert.equal(trackUnknownFaces(tracker, [{ status: "unknown" }], 3_000), 0);
  assert.equal(trackUnknownFaces(tracker, [{ status: "unknown" }], 63_000), 0);
  resetUnknownFaceTracker(tracker);
  assert.equal(trackUnknownFaces(tracker, [{ status: "unknown" }], 64_000), 1);
});
