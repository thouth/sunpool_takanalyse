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

// ===== STANDARD API ENDPOINTS =====

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

// ===== SATELLITTBILDE IMPLEMENTASJON =====

/**
 * Hjelpefunksjon for å konvertere lat/lon til UTM33
 */
function latLonToUTM33(lat, lon) {
  // Forenklet konvertering til UTM sone 33 (Norge)
  // For produksjon bør man bruke proj4 eller lignende
  const a = 6378137.0; // WGS84 semi-major axis
  const k0 = 0.9996; // UTM scale factor
  const originLon = 15.0; // Central meridian for UTM zone 33
  
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  const originLonRad = originLon * Math.PI / 180;
  
  const N = a / Math.sqrt(1 - 0.00669438 * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = 0.00669438 * Math.cos(latRad) * Math.cos(latRad) / (1 - 0.00669438);
  const A = Math.cos(latRad) * (lonRad - originLonRad);
  
  const M = a * ((1 - 0.00669438 / 4 - 3 * 0.00669438 * 0.00669438 / 64) * latRad
    - (3 * 0.00669438 / 8 + 3 * 0.00669438 * 0.00669438 / 32) * Math.sin(2 * latRad)
    + (15 * 0.00669438 * 0.00669438 / 256) * Math.sin(4 * latRad));
  
  const easting = k0 * N * (A + (1 - T + C) * A * A * A / 6) + 500000;
  const northing = k0 * (M + N * Math.tan(latRad) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A * A * A * A / 24));
  
  return { easting: Math.round(easting), northing: Math.round(northing) };
}

/**
 * OPTIONS handler for CORS preflight
 */
router.options('/satellite-image', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization, Accept',
    'Access-Control-Max-Age': '86400',
  });
  res.status(200).end();
});

// backend/src/routes/api.js
// BARE satellite-image endepunktet med forbedret feilsøking og timeout

/**
 * OPPDATERT Satellite Image Proxy
 * Med detaljert logging og bedre feilhåndtering
 */
router.get('/satellite-image', async (req, res) => {
  // CORS headers FØRST
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization, Accept',
    'Access-Control-Max-Age': '86400',
  });

  const startTime = Date.now();
  
  try {
    const { lat, lon, width = 800, height = 800, format } = req.query;

    console.log('\n========================================');
    console.log('[Satellite] NEW REQUEST');
    console.log('[Satellite] Time:', new Date().toISOString());
    console.log('[Satellite] Params:', { lat, lon, width, height, format });
    console.log('========================================\n');

    if (!lat || !lon) {
      console.error('[Satellite] ❌ Missing coordinates');
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required',
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      console.error('[Satellite] ❌ Invalid coordinates:', lat, lon);
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates',
      });
    }

    // Sjekk om koordinatene er innenfor Norge (grovt)
    if (latitude < 57 || latitude > 71 || longitude < 3 || longitude > 32) {
      console.warn('[Satellite] ⚠️ Coordinates may be outside Norway:', { latitude, longitude });
    }

    // Cache key - bruk færre desimaler for bedre cache-treff
    const cacheKey = `sat_${latitude.toFixed(3)}_${longitude.toFixed(3)}_${width}_${height}`;
    
    // Sjekk cache
    const cached = imageCache.get(cacheKey);
    if (cached) {
      console.log('[Satellite] ✅ CACHE HIT:', cacheKey);
      console.log('[Satellite] Response time:', Date.now() - startTime, 'ms');
      
      return res.json({
        success: true,
        data: {
          dataUrl: cached.dataUrl,
          contentType: cached.contentType,
          width: Number(width),
          height: Number(height),
          source: cached.source,
          cached: true,
          responseTime: Date.now() - startTime,
        },
      });
    }

    console.log('[Satellite] ❌ CACHE MISS:', cacheKey);

    // Test først om axios fungerer
    console.log('[Satellite] Testing axios connectivity...');
    
    // WMS-tjenester å prøve
    const wmsServices = [
      {
        name: 'Kartverket Ortofoto (EPSG:4326)',
        url: 'https://wms.geonorge.no/skwms1/wms.nib',
        params: {
          SERVICE: 'WMS',
          VERSION: '1.3.0',
          REQUEST: 'GetMap',
          LAYERS: 'ortofoto',
          STYLES: '',
          FORMAT: 'image/png',
          TRANSPARENT: 'FALSE',
          CRS: 'EPSG:4326',
          WIDTH: width.toString(),
          HEIGHT: height.toString(),
        },
        bboxFunction: (lat, lon) => {
          // For EPSG:4326 - øk området litt
          const size = 0.01; // Ca 1km
          return `${lon - size},${lat - size},${lon + size},${lat + size}`;
        }
      },
      {
        name: 'Kartverket Topo4 (EPSG:4326)',
        url: 'https://wms.geonorge.no/skwms1/wms.topo',
        params: {
          SERVICE: 'WMS',
          VERSION: '1.3.0',
          REQUEST: 'GetMap',
          LAYERS: 'topo4',
          STYLES: '',
          FORMAT: 'image/png',
          TRANSPARENT: 'FALSE',
          CRS: 'EPSG:4326',
          WIDTH: width.toString(),
          HEIGHT: height.toString(),
        },
        bboxFunction: (lat, lon) => {
          const size = 0.01;
          return `${lon - size},${lat - size},${lon + size},${lat + size}`;
        }
      },
      {
        name: 'OpenWMS Norgeibilder (SRS 1.1.1)',
        url: 'https://openwms.statkart.no/skwms1/wms.norgeibilder',
        params: {
          SERVICE: 'WMS',
          VERSION: '1.1.1',
          REQUEST: 'GetMap',
          LAYERS: 'ortofoto',
          STYLES: '',
          FORMAT: 'image/jpeg',
          SRS: 'EPSG:4326', // Bruk SRS for 1.1.1
          WIDTH: width.toString(),
          HEIGHT: height.toString(),
        },
        bboxFunction: (lat, lon) => {
          const size = 0.01;
          // For version 1.1.1 er BBOX minx,miny,maxx,maxy
          return `${lon - size},${lat - size},${lon + size},${lat + size}`;
        }
      }
    ];

    let lastError = null;
    let attemptCount = 0;

    // Prøv hver WMS-tjeneste
    for (const service of wmsServices) {
      attemptCount++;
      
      console.log(`\n[Satellite] 🔄 Attempt ${attemptCount}/${wmsServices.length}`);
      console.log(`[Satellite] Service: ${service.name}`);
      console.log(`[Satellite] URL: ${service.url}`);
      
      try {
        // Legg til BBOX
        const bbox = service.bboxFunction(latitude, longitude);
        service.params.BBOX = bbox;
        
        // Bygg full URL
        const queryString = new URLSearchParams(service.params).toString();
        const fullUrl = `${service.url}?${queryString}`;
        
        console.log(`[Satellite] BBOX: ${bbox}`);
        console.log(`[Satellite] Full URL: ${fullUrl.substring(0, 200)}...`);
        console.log(`[Satellite] Making request...`);
        
        const requestStart = Date.now();
        
        // Gjør request med axios
        const response = await axios({
          method: 'GET',
          url: service.url,
          params: service.params,
          responseType: 'arraybuffer',
          timeout: 20000, // 20 sekunder timeout
          maxRedirects: 5,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SolarAssessment/1.0)',
            'Accept': 'image/png,image/jpeg,image/*,*/*',
            'Accept-Encoding': 'gzip, deflate',
            'Cache-Control': 'no-cache',
          },
          validateStatus: function (status) {
            // Aksepter alle statuskoder for å kunne logge dem
            return true;
          }
        });

        const requestTime = Date.now() - requestStart;
        console.log(`[Satellite] Response received in ${requestTime}ms`);
        console.log(`[Satellite] Status: ${response.status}`);
        console.log(`[Satellite] Headers:`, {
          'content-type': response.headers['content-type'],
          'content-length': response.headers['content-length'],
        });

        // Sjekk status
        if (response.status !== 200) {
          console.error(`[Satellite] ❌ HTTP ${response.status} from ${service.name}`);
          
          // Prøv å parse error message hvis det er XML/text
          const contentType = response.headers['content-type'] || '';
          if (contentType.includes('xml') || contentType.includes('text')) {
            const errorText = Buffer.from(response.data).toString('utf8').substring(0, 500);
            console.error(`[Satellite] Error message: ${errorText}`);
          }
          
          throw new Error(`HTTP ${response.status}`);
        }

        const contentType = response.headers['content-type'] || '';
        
        // Sjekk for XML/HTML feil-respons
        if (contentType.includes('xml') || contentType.includes('html') || contentType.includes('text')) {
          const errorText = Buffer.from(response.data).toString('utf8').substring(0, 500);
          console.error(`[Satellite] ❌ Service returned error (${contentType})`);
          console.error(`[Satellite] Error content: ${errorText.substring(0, 200)}...`);
          throw new Error(`Service returned ${contentType} instead of image`);
        }

        // Sjekk at det er et bilde
        if (!contentType.startsWith('image/')) {
          console.error(`[Satellite] ❌ Unexpected content-type: ${contentType}`);
          throw new Error(`Expected image, got ${contentType}`);
        }

        // Sjekk bildestørrelse
        const imageBuffer = Buffer.from(response.data);
        console.log(`[Satellite] Image size: ${imageBuffer.length} bytes`);
        
        if (imageBuffer.length < 1000) {
          console.error(`[Satellite] ❌ Image too small (${imageBuffer.length} bytes), likely error`);
          throw new Error('Image too small');
        }

        // SUKSESS!
        console.log(`[Satellite] ✅ SUCCESS with ${service.name}!`);
        console.log(`[Satellite] Total time: ${Date.now() - startTime}ms`);
        
        // Konverter til base64
        const base64 = imageBuffer.toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;
        
        // Cache resultatet
        const cacheData = { 
          dataUrl, 
          contentType, 
          source: service.name 
        };
        imageCache.set(cacheKey, cacheData);
        console.log(`[Satellite] 💾 Cached as: ${cacheKey}`);

        // Send respons
        return res.json({
          success: true,
          data: {
            dataUrl,
            contentType,
            width: Number(width),
            height: Number(height),
            source: service.name,
            cached: false,
            attempts: attemptCount,
            responseTime: Date.now() - startTime,
          },
        });

      } catch (error) {
        lastError = error;
        
        console.error(`[Satellite] ❌ ${service.name} failed`);
        console.error(`[Satellite] Error:`, error.message);
        
        if (error.code) {
          console.error(`[Satellite] Error code:`, error.code);
        }
        
        if (error.response) {
          console.error(`[Satellite] Response status:`, error.response.status);
          console.error(`[Satellite] Response headers:`, error.response.headers);
        }
        
        // Fortsett til neste tjeneste
        continue;
      }
    }

    // Alle tjenester feilet
    console.error('\n[Satellite] ❌ ALL SERVICES FAILED');
    console.error('[Satellite] Last error:', lastError?.message);
    console.error('[Satellite] Total time:', Date.now() - startTime, 'ms\n');

    // Generer fallback SVG
    const fallbackSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" fill="#f0f4f8"/>
        <g transform="translate(${width/2}, ${height/2})">
          <circle cx="0" cy="-40" r="6" fill="#ef4444"/>
          <path d="M -3 -40 L 3 -40 L 0 -25 Z" fill="#ef4444"/>
        </g>
        <text x="50%" y="50%" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" font-weight="600" fill="#1e293b">
          Kartdata midlertidig utilgjengelig
        </text>
        <text x="50%" y="55%" dy="20" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#64748b">
          ${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°Ø
        </text>
        <text x="50%" y="${height - 30}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#94a3b8">
          WMS-tjenestene svarer ikke • ${attemptCount} forsøk gjort
        </text>
        <text x="50%" y="${height - 15}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#94a3b8">
          Responstid: ${Date.now() - startTime}ms
        </text>
      </svg>
    `;

    const svgBuffer = Buffer.from(fallbackSvg.trim());
    const svgBase64 = svgBuffer.toString('base64');
    const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`;

    // Cache fallback med kort TTL (2 minutter)
    const fallbackCache = { 
      dataUrl: svgDataUrl, 
      contentType: 'image/svg+xml', 
      source: 'fallback' 
    };
    imageCache.set(cacheKey, fallbackCache, 120);

    return res.json({
      success: true,
      data: {
        dataUrl: svgDataUrl,
        contentType: 'image/svg+xml',
        width: Number(width),
        height: Number(height),
        source: 'fallback',
        error: lastError?.message || 'All WMS services failed',
        attempts: attemptCount,
        cached: false,
        responseTime: Date.now() - startTime,
      },
    });

  } catch (unexpectedError) {
    const totalTime = Date.now() - startTime;
    
    console.error('\n[Satellite] 💥 UNEXPECTED ERROR');
    console.error('[Satellite] Error:', unexpectedError);
    console.error('[Satellite] Stack:', unexpectedError.stack);
    console.error('[Satellite] Total time:', totalTime, 'ms\n');
    
    return res.status(500).json({
      success: false,
      error: 'Unexpected error in satellite image service',
      details: unexpectedError.message,
      responseTime: totalTime,
    });
  }
});

/**
 * Alternative: Direkte link til Norgeskart
 */
router.get('/satellite-image/norgeskart-url', (req, res) => {
  const { lat, lon } = req.query;
  
  if (!lat || !lon) {
    return res.status(400).json({
      success: false,
      error: 'Coordinates required',
    });
  }

  const norgeskartUrl = `https://norgeskart.no/#!?project=norgeskart&layers=1002&zoom=18&lat=${lat}&lon=${lon}&markerLat=${lat}&markerLon=${lon}&panel=searchOptionsPanel&showSelection=false`;

  res.json({
    success: true,
    data: {
      url: norgeskartUrl,
      embedUrl: `https://norgeskart.no/embed.html?project=norgeskart&layers=1002&zoom=18&lat=${lat}&lon=${lon}`,
    },
  });
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
