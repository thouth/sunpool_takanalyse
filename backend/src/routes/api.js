// backend/src/routes/api.js
const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');

const companyController = require('../controllers/companyController');
const addressController = require('../controllers/addressController');
const analysisController = require('../controllers/analysisController');
const assessmentController = require('../controllers/assessmentController');
const validateRequest = require('../middleware/validateRequest');
const { requireApiKey } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/ratelimit');

const router = express.Router();

// Cache for satellittbilder (24 timer TTL)
const imageCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

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
 * Satellite Image Proxy med forbedret feilhåndtering og retry-logikk
 * Henter ortofoto fra Norge i bilder via WMS
 */
router.get('/satellite-image', async (req, res) => {
  try {
    const { lat, lon, width = 800, height = 800 } = req.query;

    if (!lat || !lon) {
      console.error('[Satellite] Missing coordinates in request');
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required',
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      console.error('[Satellite] Invalid coordinates:', lat, lon);
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates',
      });
    }

    // Sjekk cache først
    const cacheKey = `satellite_${lat}_${lon}_${width}_${height}`;
    const cached = imageCache.get(cacheKey);
    
    if (cached) {
      console.log('[Satellite] Returning cached image for', cacheKey);
      return res.json({
        success: true,
        data: {
          dataUrl: cached.dataUrl,
          contentType: cached.contentType,
          width: Number(width),
          height: Number(height),
          bbox: cached.bbox,
          cached: true,
        },
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

    console.log(`[Satellite] Fetching from WMS: ${imageUrl}`);

    // Retry-logikk med exponential backoff
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Satellite] Attempt ${attempt}/${maxRetries}`);
        
        const response = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 60000, // 60 sekunder timeout
          maxRedirects: 5,
          headers: {
            'User-Agent': 'Solar-Assessment-App/1.0',
            'Accept': 'image/jpeg,image/png,image/*',
          },
          validateStatus: (status) => status < 500,
        });

        // Sjekk at vi faktisk fikk et bilde
        const contentType = response.headers['content-type'];
        
        if (!contentType || !contentType.startsWith('image/')) {
          console.error('[Satellite] Invalid content type received:', contentType);
          console.error('[Satellite] Response status:', response.status);
          
          const textPreview = Buffer.from(response.data).toString('utf8', 0, 200);
          console.error('[Satellite] Response preview:', textPreview);
          
          throw new Error(`WMS returned non-image content-type: ${contentType}`);
        }

        const imageBuffer = Buffer.from(response.data);

        console.log(`[Satellite] Success on attempt ${attempt}! Size: ${imageBuffer.length} bytes, type: ${contentType}`);

        // Konverter til data URL
        const base64 = imageBuffer.toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;

        // Cache resultatet
        imageCache.set(cacheKey, {
          dataUrl,
          contentType,
          bbox,
        });

        console.log(`[Satellite] Image cached with key: ${cacheKey}`);

        // Send til frontend
        return res.json({
          success: true,
          data: {
            dataUrl,
            contentType,
            width: Number(width),
            height: Number(height),
            bbox,
            attempts: attempt,
            cached: false,
          },
        });

      } catch (error) {
        lastError = error;
        console.warn(`[Satellite] Attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        if (error.response) {
          console.warn('[Satellite] Response status:', error.response.status);
          console.warn('[Satellite] Response headers:', error.response.headers);
        }
        
        // Hvis det ikke er siste forsøk, vent før retry (exponential backoff)
        if (attempt < maxRetries) {
          const waitTime = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
          console.log(`[Satellite] Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // Alle forsøk feilet
    console.error('[Satellite] All retry attempts exhausted. Last error:', lastError.message);
    
    return res.status(503).json({
      success: false,
      error: 'Kunne ikke hente satellittbilde fra Norge i bilder',
      details: lastError.response?.status 
        ? `WMS service returned status ${lastError.response.status}`
        : lastError.message,
      suggestion: 'WMS-tjenesten kan være midlertidig utilgjengelig. Prøv igjen om et øyeblikk.',
      attempts: maxRetries,
    });

  } catch (error) {
    console.error('[Satellite] Unexpected error in satellite-image endpoint:', error);
    
    res.status(500).json({
      success: false,
      error: 'En uventet feil oppstod ved henting av satellittbilde',
      details: error.message,
    });
  }
});

/**
 * Cache management endpoints (valgfritt - for debugging/admin)
 */
router.get('/satellite-image/cache/stats', (req, res) => {
  const stats = imageCache.getStats();
  res.json({
    success: true,
    data: {
      keys: imageCache.keys().length,
      hits: stats.hits,
      misses: stats.misses,
      ksize: stats.ksize,
      vsize: stats.vsize,
    },
  });
});

router.delete('/satellite-image/cache/clear', (req, res) => {
  imageCache.flushAll();
  console.log('[Satellite] Cache cleared');
  res.json({
    success: true,
    message: 'Image cache cleared',
  });
});

module.exports = router;
