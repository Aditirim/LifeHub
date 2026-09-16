/**
 * WeatherService — OpenWeatherMap API integration.
 *
 * Uses the free tier API (no backend needed):
 *   - Current weather: api.openweathermap.org/data/2.5/weather
 *   - 5-day / 3-hour forecast: api.openweathermap.org/data/2.5/forecast
 *
 * Units: metric (°C, m/s)
 *
 * To get your free API key:
 *   1. Go to https://openweathermap.org/api
 *   2. Sign up for a free account
 *   3. Go to "My API Keys" and copy your default key
 *   4. Add it to .env as WEATHER_API_KEY=your_key_here
 */

import { WEATHER_API_KEY } from '@env';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CurrentWeather {
  city: string;
  country: string;
  temperature: number;    // Celsius
  feelsLike: number;
  humidity: number;       // Percentage
  windSpeed: number;      // m/s
  description: string;   // e.g. "clear sky"
  icon: string;          // OWM icon code e.g. "01d"
  condition: string;     // Main condition e.g. "Clear"
}

export interface ForecastDay {
  date: string;          // "YYYY-MM-DD"
  tempMin: number;
  tempMax: number;
  description: string;
  icon: string;
  condition: string;
}

// ─── Icon mapping ─────────────────────────────────────────────────────────────

/**
 * Maps an OpenWeatherMap icon code to a MaterialCommunityIcons name.
 * OWM icons: https://openweathermap.org/weather-conditions#Icon-list
 */
export function getWeatherIconName(iconCode: string): string {
  const map: Record<string, string> = {
    '01d': 'weather-sunny',
    '01n': 'weather-night',
    '02d': 'weather-partly-cloudy',
    '02n': 'weather-night-partly-cloudy',
    '03d': 'weather-cloudy',
    '03n': 'weather-cloudy',
    '04d': 'weather-cloudy',
    '04n': 'weather-cloudy',
    '09d': 'weather-rainy',
    '09n': 'weather-rainy',
    '10d': 'weather-pouring',
    '10n': 'weather-pouring',
    '11d': 'weather-lightning-rainy',
    '11n': 'weather-lightning-rainy',
    '13d': 'weather-snowy',
    '13n': 'weather-snowy',
    '50d': 'weather-fog',
    '50n': 'weather-fog',
  };
  return map[iconCode] ?? 'weather-cloudy';
}

// ─── API calls ───────────────────────────────────────────────────────────────

const BASE_URL = 'https://api.openweathermap.org/data/2.5';

/** Fetches current weather for the given coordinates. */
export async function fetchCurrentWeather(
  lat: number,
  lon: number,
): Promise<CurrentWeather> {
  if (!WEATHER_API_KEY || WEATHER_API_KEY === 'your_openweathermap_api_key_here') {
    throw new Error('WEATHER_API_KEY not configured. Add it to your .env file.');
  }

  const url = `${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  return {
    city:        data.name,
    country:     data.sys.country,
    temperature: Math.round(data.main.temp),
    feelsLike:   Math.round(data.main.feels_like),
    humidity:    data.main.humidity,
    windSpeed:   Math.round(data.wind.speed * 3.6), // convert m/s → km/h
    description: data.weather[0].description,
    icon:        data.weather[0].icon,
    condition:   data.weather[0].main,
  };
}

/** Fetches a 5-day forecast (aggregated by day) for the given coordinates. */
export async function fetchForecast(
  lat: number,
  lon: number,
): Promise<ForecastDay[]> {
  if (!WEATHER_API_KEY || WEATHER_API_KEY === 'your_openweathermap_api_key_here') {
    throw new Error('WEATHER_API_KEY not configured.');
  }

  const url = `${BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Forecast API error: ${response.status}`);
  }

  const data = await response.json();

  // The forecast API returns data in 3-hour intervals.
  // We group by day and pick min/max temperatures.
  const dayMap: Record<string, { temps: number[]; icons: string[]; descriptions: string[]; conditions: string[] }> = {};

  for (const item of data.list) {
    const dateStr = item.dt_txt.split(' ')[0]; // "YYYY-MM-DD"
    if (!dayMap[dateStr]) {
      dayMap[dateStr] = { temps: [], icons: [], descriptions: [], conditions: [] };
    }
    dayMap[dateStr].temps.push(item.main.temp);
    dayMap[dateStr].icons.push(item.weather[0].icon);
    dayMap[dateStr].descriptions.push(item.weather[0].description);
    dayMap[dateStr].conditions.push(item.weather[0].main);
  }

  // Convert to array, take the next 5 days
  return Object.entries(dayMap)
    .slice(0, 5)
    .map(([date, values]) => ({
      date,
      tempMin:     Math.round(Math.min(...values.temps)),
      tempMax:     Math.round(Math.max(...values.temps)),
      icon:        values.icons[4] ?? values.icons[0], // prefer midday icon
      description: values.descriptions[0],
      condition:   values.conditions[0],
    }));
}
