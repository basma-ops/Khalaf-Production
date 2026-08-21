export type DeviceLocation = {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: number;
};

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
  if (!isFinite(m)) return "—";
  if (m < 1) return "<1 m";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location permission denied. Enable it in your browser settings.";
    case err.POSITION_UNAVAILABLE:
      return "Could not determine your location. Move to an area with clearer sky view.";
    case err.TIMEOUT:
      return "Location request timed out. Try again outdoors.";
    default:
      return err.message || "Could not determine your location.";
  }
}

export function getCurrentLocation(
  opts: { timeoutMs?: number; maximumAgeMs?: number } = {},
): Promise<DeviceLocation> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maximumAgeMs = opts.maximumAgeMs ?? 15_000;
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

/** Continuously watch position; returns an unsubscribe fn. */
export function watchLocation(
  onUpdate: (loc: DeviceLocation) => void,
  onError: (err: Error) => void,
): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError(new Error("Geolocation is not available on this device."));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onUpdate({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      }),
    (err) => onError(new Error(geolocationErrorMessage(err))),
    { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
