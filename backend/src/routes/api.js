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

router.get('/satellite-image', async (req, res, next) => {
  try {
    const { lat, lon, width = 1024, height = 1024 } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required',
      });
    }

    const bbox = [
      parseFloat(lon) - 0.002,
      parseFloat(lat) - 0.002,
      parseFloat(lon) + 0.002,
      parseFloat(lat) + 0.002,
    ].join(',');

    const wmsUrl = process.env.KARTVERKET_WMS_URL || 'https://wms.geonorge.no/skwms1/wms.nib';
    const imageUrl = `${wmsUrl}?service=WMS&version=1.3.0&request=GetMap&layers=ortofoto&styles=&format=image/png&transparent=false&width=${width}&height=${height}&crs=EPSG:4326&bbox=${bbox}`;

    console.log(`Proxying satellite image: ${imageUrl}`);

    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Solar-Assessment-App/1.0',
      },
    });

    res.set({
      'Content-Type': response.headers['content-type'] || 'image/png',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    });

    res.send(response.data);
  } catch (error) {
    console.error('Satellite image proxy error:', error.message);

    res.status(404).json({
      success: false,
      error: 'Could not fetch satellite image',
      details: error.message,
    });
  }
});

module.exports = router;
