/**
 * Great-circle distance in metres between two WGS84 points using the
 * Haversine formula. Accurate enough for the "find nearest tree"
 * workflow (sub-metre error matters less than GPS uncertainty itself,
 * which is typically ±3-10 m on a phone).
 */
export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(m: number): string {
  if (m < 1) return "<1 m";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

export type DeviceLocation = {
  lat: number;
  lon: number;
  /** Reported horizontal accuracy radius in metres. */
  accuracy: number;
  timestamp: number;
};

/**
 * Promise wrapper around navigator.geolocation.getCurrentPosition with
 * sane defaults for outdoor field use. We accept a relatively old
 * cached fix (maximumAge 30s) because workers often re-open the app
 * walking between trees, and a 30 s old fix is fine for "what's near me".
 */
export function getCurrentLocation(
  opts: { timeoutMs?: number; maximumAgeMs?: number } = {},
): Promise<DeviceLocation> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maximumAgeMs = opts.maximumAgeMs ?? 30_000;
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not available on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
      (err) => reject(new Error(geolocationErrorMessage(err))),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: maximumAgeMs },
    );
  });
}

function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location permission was denied. Enable it in your browser settings to find the nearest tree.";
    case err.POSITION_UNAVAILABLE:
      return "Could not determine your location. Try moving to an area with a clearer sky view.";
    case err.TIMEOUT:
      return "Location request timed out. Try again with a clearer sky view.";
    default:
      return err.message || "Could not determine your location.";
  }
}
