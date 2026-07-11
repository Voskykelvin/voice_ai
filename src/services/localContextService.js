const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const weatherCache = new Map();
const WEATHER_CACHE_MS = 10 * 60 * 1000;

function withDeadline(promise, timeoutMs, fallback) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
}

const WEATHER_CODES = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'depositing rime fog',
  51: 'light drizzle',
  53: 'moderate drizzle',
  55: 'dense drizzle',
  61: 'slight rain',
  63: 'moderate rain',
  65: 'heavy rain',
  71: 'slight snow',
  73: 'moderate snow',
  75: 'heavy snow',
  80: 'slight rain showers',
  81: 'moderate rain showers',
  82: 'violent rain showers',
  95: 'thunderstorm',
  96: 'thunderstorm with slight hail',
  99: 'thunderstorm with heavy hail',
};

function cleanLocation(value) {
  const clean = String(value || '').trim();
  return clean || null;
}

async function fetchJson(url, fetchImpl = global.fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

function formatPlace(place) {
  return [place.name, place.admin1, place.country].filter(Boolean).join(', ');
}

async function geocodeLocation(location, fetchImpl = global.fetch) {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set('name', location);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const data = await fetchJson(url, fetchImpl);
  return data.results?.[0] || null;
}

function describeWeather(current = {}, units = {}) {
  const description = WEATHER_CODES[current.weather_code] || 'current conditions';
  const temperature = current.temperature_2m;
  const apparent = current.apparent_temperature;
  const windSpeed = current.wind_speed_10m;
  const precipitation = current.precipitation;
  const tempUnit = units.temperature_2m || 'C';
  const windUnit = units.wind_speed_10m || 'km/h';
  const rainUnit = units.precipitation || 'mm';

  const parts = [description];
  if (typeof temperature === 'number') parts.push(`${Math.round(temperature)}${tempUnit}`);
  if (typeof apparent === 'number') parts.push(`feels like ${Math.round(apparent)}${tempUnit}`);
  if (typeof precipitation === 'number' && precipitation > 0) parts.push(`${precipitation}${rainUnit} precipitation`);
  if (typeof windSpeed === 'number') parts.push(`wind ${Math.round(windSpeed)} ${windUnit}`);

  return parts.join(', ');
}

async function getWeatherForPlace(place, fetchImpl = global.fetch) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', String(place.latitude));
  url.searchParams.set('longitude', String(place.longitude));
  url.searchParams.set('current', [
    'temperature_2m',
    'apparent_temperature',
    'precipitation',
    'weather_code',
    'wind_speed_10m',
  ].join(','));
  url.searchParams.set('timezone', 'auto');

  const data = await fetchJson(url, fetchImpl);
  const location = formatPlace(place);

  return {
    location,
    source: 'Open-Meteo',
    time: data.current?.time || null,
    summary: describeWeather(data.current, data.current_units),
  };
}

async function getLocalWeatherContext({ location, fetchImpl = global.fetch } = {}) {
  const clean = cleanLocation(location);
  if (!clean || !fetchImpl) return null;

  const cacheKey = clean.toLowerCase();
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < WEATHER_CACHE_MS) return cached.value;

  try {
    const lookup = (async () => {
      const place = await geocodeLocation(clean, fetchImpl);
      if (!place) return { weatherError: `location not found for "${clean}"` };
      return { weather: await getWeatherForPlace(place, fetchImpl) };
    })();
    const timeoutMs = Number(process.env.WEATHER_TIMEOUT_MS || 700);
    const result = await withDeadline(lookup, timeoutMs, { weatherError: 'weather lookup timed out' });
    if (result.weather) weatherCache.set(cacheKey, { savedAt: Date.now(), value: result });
    return result;
  } catch (err) {
    return { weatherError: err.message };
  }
}

module.exports = {
  cleanLocation,
  describeWeather,
  geocodeLocation,
  getLocalWeatherContext,
  getWeatherForPlace,
};
