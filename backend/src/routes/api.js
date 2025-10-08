// backend/src/routes/api.js
const express = require('express');
const axios = require('axios');

const companyController = require('../controllers/companyController');
const addressController = require('../controllers/addressController');
const analysisController = require('../controllers/analysisController');
const assessmentController = require('../controllers/assessmentController');
const validateRequest = require('../middleware/validateRequest');
const { requireApiKey } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/ratelimit');

const router = express.Router();

const analysisLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 20 });
const assessmentLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 15 });

router.use(requireApiKey({ optional: true }));

router.post(
  '/company/verify',
  validateRequest({
    body: {
      orgNumber: {
        required: true,
        type: 'string',
        pattern: /^\d{9}$/,
        patternMessage: 'Organisasjonsnummer må bestå av 9 sifre',
      },
    },
  }),
  companyController.verifyCompany,
);

router.post(
  '/address/geocode',
  validateRequest({
    body: {
      address: {
        required: true,
        type: 'string',
        min: 5,
        minMessage: 'Adressen må være minst 5 tegn',
      },
    },
  }),
  addressController.geocodeAddress,
);

router.post(
  '/analysis/roof',
  analysisLimiter,
  validateRequest({
    body: {
      coordinates: {
        required: true,
        type: 'object',
        properties: {
          lat: { required: true, type: 'number', min: -90, max: 90 },
          lon: { required: true, type: 'number', min: -180, max: 180 },
        },
      },
    },
  }),
  analysisController.analyzeRoof,
);

router.post(
  '/analysis/location',
  analysisLimiter,
  validateRequest({
    body: {
      coordinates: {
        required: true,
        type: 'object',
        properties: {
          lat: { required: true, type: 'number', min: -90, max: 90 },
          lon: { required: true, type: 'number', min: -180, max: 180 },
        },
      },
      includeWeather: { type: 'boolean' },
    },
  }),
  analysisController.analyzeLocation,
);

router.post(
  '/assessment/full',
  assessmentLimiter,
  validateRequest({
    body: {
      orgNumber: {
        required: true,
        type: 'string',
        pattern: /^\d{9}$/,
        patternMessage: 'Organisasjonsnummer må bestå av 9 sifre',
      },
      address: {
        required: true,
        type: 'string',
      },
      companyName: { type: 'string' },
      save: { type: 'boolean' },
    },
  }),
  assessmentController.performAssessment,
);

router.get(
  '/assessment/:id',
  validateRequest({
    params: {
      id: { required: true, type: 'string' },
    },
  }),
  assessmentController.getAssessment,
);

router.get('/assessment', assessmentController.listAssessments);

/**
 * Satellite Image Proxy
 * Henter ortofoto fra Norge i bilder via WMS
 * Dette omgår CORS-problemer
 */
router.get('/satellite-image', async (req, res) => {
  try {
    const { lat, lon, width = 800, height = 800 } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required',
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    // Større bbox for bedre oversikt (ca 400m x 400m)
    const bbox = [
      longitude - 0.003,
      latitude - 0.003,
      longitude + 0.003,
      latitude + 0.003,
    ].join(',');

    // Bruk riktig WMS endepunkt for Norge i bilder
    const wmsParams = new URLSearchParams({
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetMap',
      LAYERS: 'ortofoto',
      STYLES: '',
      FORMAT: 'image/jpeg',
      TRANSPARENT: 'FALSE',
      CRS: 'EPSG:4326',
      BBOX: bbox,
      WIDTH: width.toString(),
      HEIGHT: height.toString(),
    });

    const imageUrl = `https://wms.geonorge.no/skwms1/wms.nib?${wmsParams.toString()}`;

    console.log(`Fetching satellite image: ${imageUrl}`);

    // Hent bildet fra Kartverket
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Solar-Assessment-App/1.0',
        'Accept': 'image/jpeg,image/png,image/*',
      },
    });

    // Sjekk at vi faktisk fikk et bilde
    const contentType = response.headers['content-type'];
    if (!contentType || !contentType.startsWith('image/')) {
      console.error('Invalid content type received:', contentType);
      return res.status(500).json({
        success: false,
        error: 'Invalid image format received from WMS service',
      });
    }

    // Send bildet til frontend
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    });

    res.send(response.data);
  } catch (error) {
    console.error('Satellite image proxy error:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Could not fetch satellite image',
      details: error.response?.status 
        ? `WMS service returned status ${error.response.status}`
        : error.message,
    });
  }
});

module.exports = router;
