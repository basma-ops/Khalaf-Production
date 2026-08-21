import { logger } from "./logger";

export type LiveWeatherData = {
  source: string;
  fetchedAt: string;
  cacheExpiresAt: string;
  current: {
    tempC: number;
    windKph: number;
    humidityPct: number;
    precipMm: number | null;
    weatherCode: number | null;
    observedAt: string;
  };
  forecast: Array<{
    date: string;
    tempMinC: number;
    tempMaxC: number;
    precipMm: number;
    windMaxKph: number | null;
    weatherCode: number | null;
  }>;
};

type CacheEntry = { data: LiveWeatherData; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000;

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

export async function fetchLiveWeather(lat: number, lon: number): Promise<LiveWeatherData> {
  const key = cacheKey(lat, lon);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.data;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
  );
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code",
  );
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "7");

  const res = await fetch(url.toString(), { headers: { "user-agent": "khalaf-olive-groves/1.0" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn({ status: res.status, body: text.slice(0, 200) }, "open-meteo upstream error");
    throw new Error(`Open-Meteo returned ${res.status}`);
  }
  const json = (await res.json()) as {
    current?: Record<string, number | string>;
    daily?: Record<string, Array<number | string>>;
  };
  const c = json.current ?? {};
  const d = json.daily ?? {};
  const times = (d["time"] ?? []) as string[];
  const tmax = (d["temperature_2m_max"] ?? []) as number[];
  const tmin = (d["temperature_2m_min"] ?? []) as number[];
  const psum = (d["precipitation_sum"] ?? []) as number[];
  const wmax = (d["wind_speed_10m_max"] ?? []) as number[];
  const wcode = (d["weather_code"] ?? []) as number[];

  const forecast = times.map((date, i) => ({
    date,
    tempMinC: Number(tmin[i] ?? 0),
    tempMaxC: Number(tmax[i] ?? 0),
    precipMm: Number(psum[i] ?? 0),
    windMaxKph: wmax[i] != null ? Number(wmax[i]) : null,
    weatherCode: wcode[i] != null ? Number(wcode[i]) : null,
  }));

  const data: LiveWeatherData = {
    source: "open-meteo",
    fetchedAt: new Date(now).toISOString(),
    cacheExpiresAt: new Date(now + TTL_MS).toISOString(),
    current: {
      tempC: Number(c["temperature_2m"] ?? 0),
      windKph: Number(c["wind_speed_10m"] ?? 0),
      humidityPct: Number(c["relative_humidity_2m"] ?? 0),
      precipMm: c["precipitation"] != null ? Number(c["precipitation"]) : null,
      weatherCode: c["weather_code"] != null ? Number(c["weather_code"]) : null,
      observedAt: String(c["time"] ?? new Date(now).toISOString()),
    },
    forecast,
  };
  cache.set(key, { data, expiresAt: now + TTL_MS });
  return data;
}
