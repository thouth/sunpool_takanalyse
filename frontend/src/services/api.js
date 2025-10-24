// frontend/src/services/api.js
const resolveDefaultApiUrl = () => {
  if (typeof window !== 'undefined' && window?.location?.origin) {
    return `${window.location.origin}/api`;
  }

  return 'http://localhost:3001/api';
};

const DEFAULT_API_URL = resolveDefaultApiUrl();
const API_URL = process.env.REACT_APP_API_URL || DEFAULT_API_URL;
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || API_URL;
const ensureTrailingSlash = (url) => (url.endsWith('/') ? url : `${url}/`);
const normalizeBaseUrl = (url) => url.replace(/\/$/, '');
const getBaseUrl = () => normalizeBaseUrl(API_BASE_URL || API_URL);
const API_KEY = process.env.REACT_APP_API_KEY;

const buildHeaders = (headers = {}) => {
  const combined = {
    'Content-Type': 'application/json',
    ...headers,
  };

  // Legg til API-nøkkel hvis satt og ikke allerede spesifisert
  if (API_KEY && !combined['x-api-key']) {
    combined['x-api-key'] = API_KEY;
  }

  return combined;
};

export const apiRequest = async (path, { method = 'GET', body, headers, signal } = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: buildHeaders(headers),
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    signal,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    // If response has no JSON body
    payload = null;
  }

  if (!response.ok || (payload && payload.success === false)) {
    const error = new Error(payload?.error || response.statusText || 'Ukjent feil fra API');
    error.status = response.status;
    error.details = payload?.details;
    throw error;
  }

  return payload;
};

const withProgress = async (onProgress, steps, task) => {
  if (!onProgress) {
    return task();
  }

  steps.forEach((step, index) => {
    setTimeout(() => onProgress(step), index * 50);
  });

  const result = await task();
  onProgress('Vurdering fullført');
  return result;
};

export const assessmentService = {
  async performFullAssessment(payload, onProgress) {
    const steps = [
      'Verifiserer selskap...',
      'Henter kartdata...',
      'Analyserer tak og omgivelser...',
    ];

    const response = await withProgress(onProgress, steps, () =>
      apiRequest('/assessment/full', {
        method: 'POST',
        body: payload,
      }),
    );

    return response?.data;
  },

  async verifyCompany(orgNumber) {
    const response = await apiRequest('/company/verify', {
      method: 'POST',
      body: { orgNumber },
    });

    return response.data;
  },

  async geocodeAddress(address) {
    const response = await apiRequest('/address/geocode', {
      method: 'POST',
      body: { address },
    });

    return response.data;
  },

  async analyzeRoof(coordinates) {
    const response = await apiRequest('/analysis/roof', {
      method: 'POST',
      body: { coordinates },
    });

    return response.data;
  },

  async analyzeLocation(coordinates, includeWeather = false) {
    const response = await apiRequest('/analysis/location', {
      method: 'POST',
      body: { coordinates, includeWeather },
    });

    return response.data;
  },

  async getAssessment(id) {
    const response = await apiRequest(`/assessment/${id}`);
    return response.data;
  },
};

export { API_URL, API_BASE_URL };
export const getDefaultHeaders = () => buildHeaders();
export const buildSatelliteImageUrl = (coordinates, { width = 800, height = 800, format, cacheBust } = {}) => {
  if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lon !== 'number') {
    throw new Error('Coordinates with numeric lat/lon are required to build satellite image URL');
  }

  const url = new URL('satellite-image', ensureTrailingSlash(getBaseUrl()));
  url.searchParams.set('lat', coordinates.lat);
  url.searchParams.set('lon', coordinates.lon);
  url.searchParams.set('width', width);
  url.searchParams.set('height', height);

  if (format) {
    url.searchParams.set('format', format);
  }

  if (cacheBust) {
    url.searchParams.set('cb', cacheBust);
  }

  return url.toString();
};
