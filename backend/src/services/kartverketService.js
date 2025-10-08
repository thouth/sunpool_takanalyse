// backend/src/services/kartverketService.js
const axios = require('axios');

class KartverketService {
  constructor() {
    this.addressApi = process.env.KARTVERKET_ADDRESS_API || 'https://ws.geonorge.no/adresser/v1';
    this.wmsUrl = process.env.KARTVERKET_WMS_URL || 'https://wms.geonorge.no/skwms1/wms.nib';
    this.elevationApi = process.env.KARTVERKET_ELEVATION_API || 'https://ws.geonorge.no/hoydedata/v1';
    this.useMock = process.env.MOCK_EXTERNAL_APIS === 'true';
  }

  async geocodeAddress(address) {
    try {
      const response = await axios.get(`${this.addressApi}/sok`, {
        params: {
          sok: address,
          treffPerSide: 1,
          side: 0,
        },
      });

      if (response.data.adresser && response.data.adresser.length > 0) {
        const addr = response.data.adresser[0];
        return {
          lat: addr.representasjonspunkt.lat,
          lon: addr.representasjonspunkt.lon,
          kommune: addr.kommunenavn,
          fylke: addr.fylkesnavn,
          adressetekst: addr.adressetekst,
          kilde: 'kartverket',
        };
      }

      const notFoundError = new Error('Address not found');
      notFoundError.status = 404;
      throw notFoundError;
    } catch (error) {
      if (error.status === 404 || (error.response && error.response.status === 404)) {
        throw error;
      }

      if (this.shouldMock(error)) {
        console.warn('KartverketService: Falling back to mock geocoding data', error.message || error.code);
        return this.buildMockCoordinates(address);
      }

      throw new Error('Failed to geocode address against Kartverket');
    }
  }

  getSatelliteImageUrl(coordinates) {
    // Hvis mock mode er aktivert
    if (this.useMock && process.env.MOCK_SATELLITE_IMAGE_URL) {
      return process.env.MOCK_SATELLITE_IMAGE_URL;
    }

    // Bruk backend proxy for å omgå CORS
    // Dette peker på vår egen /api/satellite-image endpoint
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3001/api';
    return `${apiBaseUrl}/satellite-image?lat=${coordinates.lat}&lon=${coordinates.lon}&width=800&height=800`;
  }

  async getElevation(coordinates) {
    try {
      const response = await axios.get(`${this.elevationApi}/punkt`, {
        params: {
          koordsys: '4326',
          nord: coordinates.lat,
          ost: coordinates.lon,
          geojson: 'false',
        },
      });

      return {
        elevation: response.data.punkt.z || 0,
        datakilder: response.data.punkt.datakilde,
        kilde: 'kartverket',
      };
    } catch (error) {
      if (this.shouldMock(error)) {
        console.warn('KartverketService: Falling back to mock elevation data', error.message || error.code);
        return {
          elevation: this.buildMockElevation(coordinates),
          datakilder: 'mock',
          kilde: 'mock',
        };
      }

      console.error('Elevation API error:', error);
      return { elevation: 0 };
    }
  }

  async analyzeLocation(coordinates) {
    const elevation = await this.getElevation(coordinates);

    let region = 'Østlandet';
    let solarHours = 1650;
    let windCondition = 'Moderat';

    if (coordinates.lat > 63) {
      region = 'Nord-Norge';
      solarHours = 1300;
      windCondition = 'Høy';
    } else if (coordinates.lat > 61) {
      region = 'Trøndelag';
      solarHours = 1500;
      windCondition = 'Moderat';
    } else if (coordinates.lon < 7) {
      region = 'Vestlandet';
      solarHours = 1450;
      windCondition = 'Høy';
    } else if (coordinates.lat < 59) {
      region = 'Sørlandet';
      solarHours = 1700;
      windCondition = 'Lav';
    }

    return {
      region,
      elevation: elevation.elevation,
      annualSolarHours: solarHours,
      windCondition,
      averageProduction: Math.floor(solarHours * 0.85),
      snowLoad: region === 'Nord-Norge' ? 'Høy' : 'Moderat',
      solarIrradiation: 900 + Math.floor(Math.random() * 200),
      kilde: elevation.kilde || 'derived',
    };
  }

  shouldMock(error) {
    if (this.useMock) {
      return true;
    }

    if (!error || !error.response) {
      return true;
    }

    if (error.code && ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code)) {
      return true;
    }

    if (error.response.status >= 500) {
      return true;
    }

    return false;
  }

  buildMockCoordinates(address) {
    const hash = this.hash(address);
    const lat = 58 + (hash % 1300) / 100;
    const lon = 5 + ((hash >> 8) % 2000) / 100;

    const kommuner = [
      { kommune: 'Oslo', fylke: 'Oslo' },
      { kommune: 'Bergen', fylke: 'Vestland' },
      { kommune: 'Trondheim', fylke: 'Trøndelag' },
      { kommune: 'Stavanger', fylke: 'Rogaland' },
      { kommune: 'Tromsø', fylke: 'Troms og Finnmark' },
    ];

    const kommuneData = kommuner[hash % kommuner.length];

    return {
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4)),
      kommune: kommuneData.kommune,
      fylke: kommuneData.fylke,
      adressetekst: address,
      kilde: 'mock',
    };
  }

  buildMockElevation(coordinates) {
    const noise = Math.sin(coordinates.lat * 0.8 + coordinates.lon * 1.2) * 50;
    const base = coordinates.lat > 63 ? 250 : coordinates.lat < 59 ? 50 : 120;
    return Math.round(base + noise);
  }

  hash(value) {
    return value
      .split('')
      .reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0) >>> 0;
  }
}

module.exports = new KartverketService();
