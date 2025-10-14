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

/**
 * FORBEDRET Satellite Image Proxy med multiple WMS-tjenester
 * Prøver flere kilder i prioritert rekkefølge
 */
router.get('/satellite-image', async (req, res) => {
  // CORS headers
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization, Accept',
    'Access-Control-Max-Age': '86400',
  });

  try {
    const { lat, lon, width = 800, height = 800, format } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required',
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates',
      });
    }

    // Sjekk om koordinatene er innenfor Norge
    if (latitude < 57 || latitude > 71 || longitude < 4 || longitude > 31) {
      return res.status(400).json({
        success: false,
        error: 'Coordinates are outside Norway',
      });
    }

    // Cache key
    const cacheKey = `sat_${latitude.toFixed(4)}_${longitude.toFixed(4)}_${width}_${height}`;
    const cached = imageCache.get(cacheKey);
    
    if (cached) {
      console.log('[Satellite] Cache HIT');
      return res.json({
        success: true,
        data: {
          dataUrl: cached.dataUrl,
          contentType: cached.contentType,
          width: Number(width),
          height: Number(height),
          source: cached.source,
          cached: true,
        },
      });
    }

    console.log('[Satellite] Fetching for coordinates:', { lat: latitude, lon: longitude });

    // WMS-tjenester i prioritert rekkefølge
    const wmsServices = [
      {
        name: 'Norge i bilder - Ortofoto',
        url: 'https://wms.geonorge.no/skwms1/wms.nib',
        layers: 'ortofoto',
        version: '1.3.0',
        crs: 'EPSG:25833', // UTM33
        format: 'image/jpeg',
        transparent: false,
        useUTM: true
      },
      {
        name: 'Kartverket - Norgeibilder',
        url: 'https://openwms.statkart.no/skwms1/wms.norgeibilder',
        layers: 'ortofoto',
        version: '1.3.0',
        crs: 'EPSG:25833',
        format: 'image/jpeg',
        transparent: false,
        useUTM: true
      },
      {
        name: 'Norge i bilder - Cache',
        url: 'https://cache.kartverket.no/nib/v1/wmts/1.0.0',
        layers: 'norgeibilder',
        version: '1.1.1',
        crs: 'EPSG:4326',
        format: 'image/jpeg',
        transparent: false,
        useUTM: false
      },
      {
        name: 'Kartverket Topografisk',
        url: 'https://openwms.statkart.no/skwms1/wms.topo',
        layers: 'topo4',
        version: '1.3.0',
        crs: 'EPSG:25833',
        format: 'image/png',
        transparent: false,
        useUTM: true
      }
    ];

    let lastError = null;
    
    // Prøv hver WMS-tjeneste
    for (const service of wmsServices) {
      console.log(`[Satellite] Trying: ${service.name}`);
      
      try {
        let bbox;
        let srsName = service.crs;
        
        if (service.useUTM) {
          // Konverter til UTM33 og lag BBOX
          const center = latLonToUTM33(latitude, longitude);
          const halfSize = 500; // 500 meter i hver retning = 1km x 1km
          
          bbox = [
            center.easting - halfSize,
            center.northing - halfSize,
            center.easting + halfSize,
            center.northing + halfSize
          ].join(',');
        } else {
          // Bruk lat/lon direkte (EPSG:4326)
          const bboxSize = 0.005; // Ca 500m i hver retning
          bbox = [
            longitude - bboxSize,
            latitude - bboxSize,
            longitude + bboxSize,
            latitude + bboxSize
          ].join(',');
        }

        // Bygg WMS GetMap request
        const params = new URLSearchParams({
          SERVICE: 'WMS',
          VERSION: service.version,
          REQUEST: 'GetMap',
          LAYERS: service.layers,
          STYLES: '',
          FORMAT: service.format,
          TRANSPARENT: service.transparent ? 'TRUE' : 'FALSE',
          [service.version === '1.3.0' ? 'CRS' : 'SRS']: srsName,
          BBOX: bbox,
          WIDTH: width.toString(),
          HEIGHT: height.toString(),
        });

        const wmsUrl = `${service.url}?${params.toString()}`;
        console.log(`[Satellite] Request URL: ${wmsUrl.substring(0, 150)}...`);

        const response = await axios.get(wmsUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
          maxRedirects: 5,
          headers: {
            'User-Agent': 'SolarAssessment/1.0',
            'Accept': `${service.format},image/*`,
            'Accept-Encoding': 'gzip, deflate',
          },
          validateStatus: (status) => status < 500,
        });

        const contentType = response.headers['content-type'] || '';
        
        // Sjekk om vi fikk et feilsvar (XML/HTML)
        if (contentType.includes('xml') || contentType.includes('html') || contentType.includes('text')) {
          const errorText = Buffer.from(response.data).toString('utf8').substring(0, 500);
          console.warn(`[Satellite] ${service.name} returned error:`, errorText.substring(0, 200));
          throw new Error('Service returned error response');
        }

        // Sjekk at vi fikk et bilde
        if (!contentType.startsWith('image/')) {
          throw new Error(`Unexpected content type: ${contentType}`);
        }

        const imageBuffer = Buffer.from(response.data);
        if (imageBuffer.length < 1000) {
          throw new Error('Image too small, likely an error tile');
        }

        // Suksess! Konverter til base64
        const base64 = imageBuffer.toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;

        console.log(`[Satellite] SUCCESS with ${service.name}! Size: ${imageBuffer.length} bytes`);

        // Cache resultatet
        const cacheData = { 
          dataUrl, 
          contentType, 
          source: service.name 
        };
        imageCache.set(cacheKey, cacheData);

        // Returner suksess
        return res.json({
          success: true,
          data: {
            dataUrl,
            contentType,
            width: Number(width),
            height: Number(height),
            source: service.name,
            cached: false,
          },
        });

      } catch (error) {
        lastError = error;
        console.warn(`[Satellite] ${service.name} failed:`, error.message);
        continue; // Prøv neste tjeneste
      }
    }

    // Alle WMS-tjenester feilet
    console.error('[Satellite] All WMS services failed');

    // Fallback: Generer et kart-placeholder med SVG
    const svgMap = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e0e0e0" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="${width}" height="${height}" fill="#f5f5f5"/>
        <rect width="${width}" height="${height}" fill="url(#grid)"/>
        <g transform="translate(${width/2}, ${height/2})">
          <circle r="8" fill="#d32f2f"/>
          <circle r="6" fill="#ffffff"/>
          <circle r="4" fill="#d32f2f"/>
        </g>
        <text x="50%" y="20" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#333">
          Satellittbilde midlertidig utilgjengelig
        </text>
        <text x="50%" y="45" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#666">
          ${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°Ø
        </text>
        <text x="50%" y="${height - 20}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#999">
          Kartgrunnlag: Kartverket
        </text>
      </svg>
    `;

    const svgBuffer = Buffer.from(svgMap.trim());
    const svgBase64 = svgBuffer.toString('base64');
    const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`;

    // Cache placeholder også (kortere TTL)
    const placeholderCache = { 
      dataUrl: svgDataUrl, 
      contentType: 'image/svg+xml', 
      source: 'placeholder' 
    };
    imageCache.set(cacheKey, placeholderCache, 300); // 5 min TTL for placeholder

    return res.json({
      success: true,
      data: {
        dataUrl: svgDataUrl,
        contentType: 'image/svg+xml',
        width: Number(width),
        height: Number(height),
        source: 'placeholder',
        error: 'WMS services unavailable',
        cached: false,
      },
    });

  } catch (error) {
    console.error('[Satellite] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch satellite image',
      details: error.message,
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
