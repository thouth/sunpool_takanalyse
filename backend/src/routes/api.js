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
 * DEBUG ENDPOINT - Test WMS direkte
 */
router.get('/satellite-image/debug', async (req, res) => {
  const { lat = 58.8960, lon = 5.6868 } = req.query;

  const bboxSize = 0.003;
  const bbox = [
    parseFloat(lon) - bboxSize,
    parseFloat(lat) - bboxSize,
    parseFloat(lon) + bboxSize,
    parseFloat(lat) + bboxSize,
  ].join(',');

  const wmsUrl = 'https://wms.geonorge.no/skwms1/wms.nib';
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: 'ortofoto',
    STYLES: '',
    FORMAT: 'image/jpeg',
    TRANSPARENT: 'FALSE',
    CRS: 'EPSG:4326',
    BBOX: bbox,
    WIDTH: '800',
    HEIGHT: '800',
  });

  const fullUrl = `${wmsUrl}?${params.toString()}`;

  console.log('=== WMS DEBUG ===');
  console.log('URL:', fullUrl);
  console.log('Coordinates:', { lat, lon });
  console.log('BBOX:', bbox);

  try {
    const response = await axios.get(fullUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      validateStatus: () => true,
    });

    const contentType = response.headers['content-type'];
    const contentLength = response.headers['content-length'];

    console.log('Response Status:', response.status);
    console.log('Content-Type:', contentType);
    console.log('Content-Length:', contentLength);
    console.log('Headers:', response.headers);

    if (contentType && contentType.includes('xml')) {
      const errorText = Buffer.from(response.data).toString('utf8');
      console.log('WMS Error Response:', errorText);
      
      return res.json({
        success: false,
        error: 'WMS returned XML error',
        details: errorText,
        url: fullUrl,
        contentType,
      });
    }

    if (contentType && contentType.startsWith('image/')) {
      const buffer = Buffer.from(response.data);
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${contentType};base64,${base64}`;

      return res.json({
        success: true,
        message: 'Image retrieved successfully!',
        url: fullUrl,
        contentType,
        size: buffer.length,
        dataUrlPreview: dataUrl.substring(0, 100) + '...',
        bbox,
        fullDataUrl: dataUrl,
      });
    }

    const preview = Buffer.from(response.data).toString('utf8', 0, 500);
    return res.json({
      success: false,
      error: 'Unexpected content type',
      contentType,
      preview,
      url: fullUrl,
    });

  } catch (error) {
    console.error('WMS Request Failed:', error.message);
    
    return res.json({
      success: false,
      error: error.message,
      code: error.code,
      url: fullUrl,
      responseStatus: error.response?.status,
      responseHeaders: error.response?.headers,
    });
  }
});

/**
 * Satellite Image Proxy med retry-logikk og fallback
 */
// Erstatt hele /api/satellite-image endepunktet i backend/src/routes/api.js
// Start fra linje ~180 (etter /assessment routes)

router.get('/satellite-image', async (req, res) => {
  try {
    const { lat, lon, width = 800, height = 800 } = req.query;

    if (!lat || !lon) {
      console.error('[Satellite] Missing coordinates');
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
      console.log('[Satellite] Cache HIT:', cacheKey);
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

    console.log('[Satellite] Cache MISS:', cacheKey);

    // Bygg WMS URL med riktig BBOX format for EPSG:4326
    const bboxSize = 0.003;
    
    // VIKTIG: EPSG:4326 bruker lat,lon rekkefølge (nord,øst)
    // Format: minLat,minLon,maxLat,maxLon
    const bbox = [
      latitude - bboxSize,   // minLat (sør)
      longitude - bboxSize,  // minLon (vest)
      latitude + bboxSize,   // maxLat (nord)
      longitude + bboxSize,  // maxLon (øst)
    ].join(',');

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
    console.log('[Satellite] WMS URL:', imageUrl);
    console.log('[Satellite] BBOX:', bbox);

    // Retry-logikk
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Satellite] Attempt ${attempt}/${maxRetries}`);
        
        const response = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 60000,
          maxRedirects: 5,
          headers: {
            'User-Agent': 'Solar-Assessment-App/1.0',
            'Accept': 'image/jpeg,image/png,image/*',
          },
          validateStatus: (status) => status < 500,
        });

        const contentType = response.headers['content-type'] || '';
        const contentLength = response.headers['content-length'] || 0;
        
        console.log('[Satellite] Response status:', response.status);
        console.log('[Satellite] Content-Type:', contentType);
        console.log('[Satellite] Content-Length:', contentLength);

        // Sjekk for XML feilmeldinger fra WMS
        if (contentType.includes('xml') || contentType.includes('text')) {
          const errorText = Buffer.from(response.data).toString('utf8');
          console.error('[Satellite] WMS returned XML/text error:');
          console.error(errorText.substring(0, 500));
          
          // Parse WMS error hvis mulig
          const errorMatch = errorText.match(/<ServiceException[^>]*>(.*?)<\/ServiceException>/i);
          const wmsError = errorMatch ? errorMatch[1] : 'WMS service error';
          
          throw new Error(`WMS Error: ${wmsError}`);
        }

        // Sjekk at vi faktisk fikk et bilde
        if (!contentType.startsWith('image/')) {
          console.error('[Satellite] Invalid content-type:', contentType);
          const preview = Buffer.from(response.data).toString('utf8', 0, 200);
          console.error('[Satellite] Response preview:', preview);
          throw new Error(`Expected image, got: ${contentType}`);
        }

        const imageBuffer = Buffer.from(response.data);
        
        // Valider at buffer ikke er tom
        if (imageBuffer.length === 0) {
          throw new Error('Received empty image buffer');
        }

        console.log(`[Satellite] SUCCESS on attempt ${attempt}!`);
        console.log(`[Satellite] Image size: ${imageBuffer.length} bytes`);

        // Konverter til base64 data URL
        const base64 = imageBuffer.toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;

        // Cache resultatet
        imageCache.set(cacheKey, { dataUrl, contentType, bbox });
        console.log('[Satellite] Cached with key:', cacheKey);

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
        console.warn(`[Satellite] Attempt ${attempt}/${maxRetries} FAILED:`, error.message);
        
        if (error.response) {
          console.warn('[Satellite] Error response status:', error.response.status);
          console.warn('[Satellite] Error response headers:', error.response.headers);
        }
        
        // Hvis siste forsøk, ikke retry
        if (attempt === maxRetries) {
          break;
        }
        
        // Exponential backoff
        const waitTime = 1000 * Math.pow(2, attempt - 1);
        console.log(`[Satellite] Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // Alle forsøk feilet
    console.error('[Satellite] All attempts exhausted. Last error:', lastError.message);
    
    return res.status(503).json({
      success: false,
      error: 'Kunne ikke hente satellittbilde fra Norge i bilder',
      details: lastError.message,
      wmsUrl: imageUrl,
      suggestion: 'WMS-tjenesten kan være midlertidig utilgjengelig eller koordinatene er utenfor dekningsområdet.',
      fallbackUrl: `https://norgeskart.no/#!?project=norgeskart&layers=1002&zoom=17&lat=${latitude}&lon=${longitude}`,
    });

  } catch (error) {
    console.error('[Satellite] Unexpected error:', error);
    
    res.status(500).json({
      success: false,
      error: 'En uventet feil oppstod ved henting av satellittbilde',
      details: error.message,
    });
  }
});

/**
 * Cache management endpoints
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
