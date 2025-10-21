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
    const requestSource = 'Kartverket Adresse API';
    const requestStarted = Date.now();

    try {
      // Hvis vi bruker mock, returner mock-data direkte
      if (this.useMock) {
        console.log('[KartverketService] Using mock data for geocoding');
        return this.buildMockCoordinates(address);
      }

      const response = await axios.get(`${this.addressApi}/sok`, {
        params: {
          sok: address,
          treffPerSide: 1,
          side: 0,
        },
        timeout: 10000,
        httpsAgent: new (require('https').Agent)({ 
          rejectUnauthorized: false 
        }),
      });

      const responseTimeMs = Date.now() - requestStarted;

      if (response.data.adresser && response.data.adresser.length > 0) {
        this.logExternalCall('geocodeAddress', {
          source: requestSource,
          status: response.status,
          durationMs: responseTimeMs,
        });

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
      notFoundError.durationMs = responseTimeMs;
      throw notFoundError;
    } catch (error) {
      const durationMs = typeof error.durationMs === 'number'
        ? error.durationMs
        : Date.now() - requestStarted;
      const status = error.response?.status ?? error.status;

      this.logExternalCall('geocodeAddress', {
        source: requestSource,
        status,
        durationMs,
        error,
      });

      if (status === 404) {
        throw error;
      }

      if (this.shouldMock(error)) {
        console.warn('[KartverketService] Geocoding - falling back to mock:', error.message);
        return this.buildMockCoordinates(address);
      }

      throw new Error('Failed to geocode address');
    }
  }

  getSatelliteImageUrl(coordinates) {
    // Sjekk først om vi skal bruke mock
    if (this.useMock) {
      console.log('[KartverketService] Using mock/placeholder for satellite image');
      // Returner en enkel placeholder URL som faktisk fungerer
      return `https://via.placeholder.com/800x800.png?text=Bygning+${coordinates.lat.toFixed(4)}N+${coordinates.lon.toFixed(4)}E`;
    }

    // Sjekk om vi har en mock URL i miljøvariablene
    if (process.env.MOCK_SATELLITE_IMAGE_URL) {
      console.log('[KartverketService] Using configured mock satellite image URL');
      return process.env.MOCK_SATELLITE_IMAGE_URL;
    }

    // Returner URL til vår egen satellite-image endpoint
    const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';
    const defaultApiBaseUrl = isProduction
      ? 'https://solar-assessment-backend.onrender.com/api'
      : 'http://localhost:3001/api';
    const apiBaseUrl = process.env.API_BASE_URL || defaultApiBaseUrl;
    const url = `${apiBaseUrl}/satellite-image?lat=${coordinates.lat}&lon=${coordinates.lon}&width=800&height=800`;
    
    console.log('[KartverketService] Generated satellite URL:', url);
    return url;
  }

  getNorgeskartUrl(coordinates, { zoom = 18 } = {}) {
    if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lon !== 'number') {
      throw new Error('Valid coordinates are required to generate Norgeskart URL');
    }

    const lat = coordinates.lat.toFixed(6);
    const lon = coordinates.lon.toFixed(6);

    return `https://norgeskart.no/#!?project=norgeskart&layers=1002&zoom=${zoom}&lat=${lat}&lon=${lon}&markerLat=${lat}&markerLon=${lon}&panel=searchOptionsPanel&showSelection=false`;
  }

  async getElevation(coordinates) {
    const requestSource = 'Kartverket Elevation API';
    let requestStarted;

    try {
      // Hvis vi bruker mock, returner mock-data direkte
      if (this.useMock) {
        return {
          elevation: this.buildMockElevation(coordinates),
          datakilder: 'mock',
          kilde: 'mock',
        };
      }

      requestStarted = Date.now();
      const response = await axios.get(`${this.elevationApi}/punkt`, {
        params: {
          koordsys: '4326',
          nord: coordinates.lat,
          ost: coordinates.lon,
          geojson: 'false',
        },
        timeout: 10000,
        httpsAgent: new (require('https').Agent)({ 
          rejectUnauthorized: false 
        }),
      });

      const responseTimeMs = Date.now() - requestStarted;
      this.logExternalCall('getElevation', {
        source: requestSource,
        status: response.status,
        durationMs: responseTimeMs,
      });

      // Sikker parsing av elevation
      let elevation = 0;

      if (response.data) {
        if (response.data.punkt && typeof response.data.punkt.z === 'number') {
          elevation = response.data.punkt.z;
        } else if (typeof response.data.z === 'number') {
          elevation = response.data.z;
        } else if (typeof response.data.elevation === 'number') {
          elevation = response.data.elevation;
        }
      }

      return {
        elevation: Math.round(elevation),
        datakilder: response.data?.punkt?.datakilde || 'kartverket',
        kilde: 'kartverket',
      };
    } catch (error) {
      console.warn('[KartverketService] Elevation API error:', error.message);

      this.logExternalCall('getElevation', {
        source: requestSource,
        status: error.response?.status ?? error.status,
        durationMs: typeof requestStarted === 'number' ? Date.now() - requestStarted : undefined,
        error,
      });

      if (this.shouldMock(error)) {
        console.warn('[KartverketService] Elevation - falling back to mock');
        return {
          elevation: this.buildMockElevation(coordinates),
          datakilder: 'mock',
          kilde: 'mock',
        };
      }

      console.error('[KartverketService] Failed to get elevation, using 0');
      return { 
        elevation: 0, 
        datakilder: 'error',
        kilde: 'error' 
      };
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
    // Alltid bruk mock hvis det er satt i miljøvariablene
    if (this.useMock) {
      return true;
    }

    // Hvis vi ikke har en error response, bruk mock
    if (!error || !error.response) {
      return true;
    }

    // Nettverksfeil - bruk mock
    if (error.code && ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNABORTED'].includes(error.code)) {
      return true;
    }

    // Server-feil - bruk mock
    if (error.response && error.response.status >= 500) {
      return true;
    }

    // Rate limiting eller auth-feil - bruk mock
    if (error.response && [401, 403, 429].includes(error.response.status)) {
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

  logExternalCall(operation, { source, status, durationMs, error }) {
    const payload = {
      source,
      status: typeof status === 'number' ? status : status || 'unknown',
    };

    if (typeof durationMs === 'number') {
      payload.durationMs = durationMs;
    }

    if (error) {
      payload.errorMessage = error.message;
      if (error.response && error.response.data) {
        try {
          payload.errorResponse = typeof error.response.data === 'string'
            ? error.response.data.slice(0, 200)
            : JSON.stringify(error.response.data).slice(0, 200);
        } catch (stringifyError) {
          payload.errorResponse = '[unserializable response data]';
        }
      }

      console.error(`[KartverketService] ${operation} failed`, payload);
    } else {
      console.info(`[KartverketService] ${operation} succeeded`, payload);
    }
  }

  hash(value) {
    return value
      .split('')
      .reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0) >>> 0;
  }
}

module.exports = new KartverketService();
