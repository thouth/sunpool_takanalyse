// backend/src/services/weatherService.js
class WeatherService {
  constructor() {
    this.cache = new Map();
    this.cacheTtl = parseInt(process.env.WEATHER_CACHE_TTL_MS, 10) || 60 * 60 * 1000; // 1 hour
  }

  async getWeatherSummary(coordinates) {
    const cacheKey = this.getCacheKey(coordinates);
    const cached = this.cache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < this.cacheTtl) {
      return cached.data;
    }

    const summary = this.buildSyntheticForecast(coordinates);

    this.cache.set(cacheKey, {
      timestamp: Date.now(),
      data: summary,
    });

    return summary;
  }

  buildSyntheticForecast(coordinates) {
    const now = new Date();
    const seasonalAdjustment = this.getSeasonalAdjustment(now.getMonth());
    const latFactor = 1 - Math.min(Math.abs(coordinates.lat - 60) * 0.015, 0.3);

    const baseNoise = this.createNoise(coordinates.lat, coordinates.lon);
    const secondaryNoise = this.createNoise(coordinates.lat, coordinates.lon, 17.3);

    const daylightHours = this.clamp(7 + seasonalAdjustment + latFactor * 4 + (secondaryNoise - 0.5) * 2, 4, 19);
    const clearnessIndex = this.clamp(0.52 + (daylightHours - 10) * 0.015 + (baseNoise - 0.5) * 0.1, 0.38, 0.78);

    const averageTemp = 6 + seasonalAdjustment * 1.2 + (baseNoise - 0.5) * 8 - Math.abs(coordinates.lat - 60) * 0.4;
    const minTemp = averageTemp - (4 + secondaryNoise * 3);
    const maxTemp = averageTemp + (5 + (1 - secondaryNoise) * 3);

    const windAverage = this.clamp(5 + (1 - latFactor) * 4 + (secondaryNoise - 0.5) * 3, 1, 14);
    const windMax = this.clamp(windAverage + 6 + (baseNoise * 4), 4, 24);

    const precipitationProbability = this.clamp(35 + (1 - clearnessIndex) * 90, 15, 85);
    const expectedRain = this.clamp(precipitationProbability / 100 * (8 + baseNoise * 10), 0, 20);
    const cloudCover = this.clamp((1 - clearnessIndex) * 100, 10, 85);

    const productionModifier = this.clamp(0.9 + (clearnessIndex - 0.5) * 0.9 - precipitationProbability / 100 * 0.1, 0.75, 1.15);

    return {
      source: 'Simulated MET Norway dataset',
      period: 'next_7_days',
      coordinates: {
        lat: coordinates.lat,
        lon: coordinates.lon,
      },
      daylightHours: Number(daylightHours.toFixed(1)),
      clearnessIndex: Number(clearnessIndex.toFixed(2)),
      productionModifier: Number(productionModifier.toFixed(2)),
      temperature: {
        average: Number(averageTemp.toFixed(1)),
        min: Number(minTemp.toFixed(1)),
        max: Number(maxTemp.toFixed(1)),
      },
      wind: {
        average: Number(windAverage.toFixed(1)),
        max: Number(windMax.toFixed(1)),
      },
      precipitation: {
        probability: Math.round(precipitationProbability),
        expected: Number(expectedRain.toFixed(1)),
      },
      cloudCover: Math.round(cloudCover),
      updatedAt: new Date().toISOString(),
    };
  }

  getSeasonalAdjustment(monthIndex) {
    if ([5, 6, 7].includes(monthIndex)) {
      return 5.5; // Summer months
    }
    if ([3, 4, 8].includes(monthIndex)) {
      return 2.5;
    }
    if ([9, 10].includes(monthIndex)) {
      return -1.5;
    }
    return -4; // Winter months
  }

  createNoise(lat, lon, offset = 0) {
    const raw = Math.sin(lat * 12.9898 + lon * 78.233 + offset) * 43758.5453;
    return raw - Math.floor(raw);
  }

  getCacheKey(coordinates) {
    return `${coordinates.lat.toFixed(2)}:${coordinates.lon.toFixed(2)}`;
  }

  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
}

module.exports = new WeatherService();
