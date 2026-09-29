const ALERT_COOLDOWN_MS = 60_000;

export function createUnknownFaceTracker() {
  return { active: false, clearScans: 0, lastNotifiedAt: null };
}

export function resetUnknownFaceTracker(tracker) {
  tracker.active = false;
  tracker.clearScans = 0;
}

export function trackUnknownFaces(tracker, faces, now = Date.now()) {
  const count = faces?.filter((face) => face.status === "unknown").length || 0;
  if (count > 0) {
    tracker.clearScans = 0;
    const shouldNotify = !tracker.active && (tracker.lastNotifiedAt === null || now - tracker.lastNotifiedAt >= ALERT_COOLDOWN_MS);
    tracker.active = true;
    if (shouldNotify) {
      tracker.lastNotifiedAt = now;
      return count;
    }
    return 0;
  }
  tracker.clearScans += 1;
  if (tracker.clearScans >= 2) tracker.active = false;
  return 0;
}
