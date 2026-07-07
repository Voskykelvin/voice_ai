const { getLocalWeatherContext } = require('../src/services/localContextService');

describe('localContextService', () => {
  it('resolves a location into a compact current weather context', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const href = String(url);
      if (href.includes('geocoding-api')) {
        return {
          ok: true,
          json: async () => ({
            results: [{
              name: 'Nairobi',
              admin1: 'Nairobi County',
              country: 'Kenya',
              latitude: -1.2833,
              longitude: 36.8167,
            }],
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          current: {
            time: '2026-07-07T14:00',
            temperature_2m: 24.4,
            apparent_temperature: 25.1,
            precipitation: 0,
            weather_code: 2,
            wind_speed_10m: 11.2,
          },
          current_units: {
            temperature_2m: 'C',
            apparent_temperature: 'C',
            precipitation: 'mm',
            wind_speed_10m: 'km/h',
          },
        }),
      };
    });

    const context = await getLocalWeatherContext({ location: 'Nairobi, Kenya', fetchImpl });

    expect(context.weather.location).toBe('Nairobi, Nairobi County, Kenya');
    expect(context.weather.summary).toContain('partly cloudy');
    expect(context.weather.summary).toContain('24C');
    expect(context.weather.source).toBe('Open-Meteo');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
