// frontend/src/services/imageAnalysis.js
import { apiRequest } from './api';

export const fetchRoofAnalysis = async (coordinates) => {
  const response = await apiRequest('/analysis/roof', {
    method: 'POST',
    body: { coordinates },
  });

  return response.data;
};

export const fetchLocationAnalysis = async (coordinates, includeWeather = true) => {
  const response = await apiRequest('/analysis/location', {
    method: 'POST',
    body: { coordinates, includeWeather },
  });

  return response.data;
};

export const fetchSatelliteImage = async (coordinates) => {
  const roofAnalysis = await fetchRoofAnalysis(coordinates);
  return roofAnalysis.imageUrl;
};
