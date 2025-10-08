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
 */
router.get('/satellite-image', async (req, res) => {
  try {
    const { lat, lon, width = 800, height = 800 } = req.query;

    if (!lat || !lon) {
      console.error('Missing coordinates in satellite-image request');
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required',
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      console.error('Invalid coordinates:', lat, lon);
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates',
      });
    }

    // Større bbox for bedre oversikt (ca 400m x 400m)
    const bboxSize = 0.003;
    const bbox = [
      longitude - bboxSize,
      latitude - bboxSize,
      longitude + bboxSize,
      latitude + bboxSize,
    ].join(',');

    // WMS endepunkt
    const wmsBaseUrl = 'https://wms.geonorge.no/skwms1/wms.nib';
    
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

    const imageUrl = `${wmsBaseUrl}?${wmsParams.toString()}`;

    console.log(`Fetching satellite image from: ${imageUrl}`);

    // Hent bildet med lengre timeout
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 45000, // 45 sekunder
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Solar-Assessment-App/1.0',
        'Accept': 'image/jpeg,image/png,image/*',
      },
      validateStatus: (status) => status < 500, // Accept redirects
    });

    // Sjekk at vi faktisk fikk et bilde
    const contentType = response.headers['content-type'];
    
    if (!contentType || !contentType.startsWith('image/')) {
      console.error('Invalid content type received:', contentType);
      console.error('Response status:', response.status);
      console.error('Response data (first 200 chars):', 
        Buffer.from(response.data).toString('utf8', 0, 200)
      );
      
      return res.status(500).json({
        success: false,
        error: 'WMS service did not return an image',
        details: `Received content-type: ${contentType}`,
      });
    }

    const imageBuffer = Buffer.from(response.data);

    console.log(`Successfully fetched image, size: ${imageBuffer.length} bytes, type: ${contentType}`);

    if ((req.query.format || req.query.response) === 'data-url') {
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      });

      const base64 = imageBuffer.toString('base64');
      const dataUrl = `data:${contentType};base64,${base64}`;

      return res.json({
        success: true,
        data: {
          dataUrl,
          contentType,
          width: Number(width),
          height: Number(height),
          bbox,
        },
      });
    }

    // Send bildet til frontend som binærdata
    res.set({
      'Content-Type': contentType,
      'Content-Length': imageBuffer.length,
      'Cache-Control': 'public, max-age=86400', // Cache 24 timer
      'Access-Control-Allow-Origin': '*',
    });

    res.send(imageBuffer);

  } catch (error) {
    console.error('Satellite image proxy error:', error.message);
    
    if (error.response) {
      console.error('WMS service responded with status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
    
    res.status(500).json({
      success: false,
      error: 'Could not fetch satellite image from Norge i bilder',
      details: error.response?.status 
        ? `WMS service returned status ${error.response.status}`
        : error.message,
    });
  }
});

module.exports = router;
