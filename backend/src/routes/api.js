// backend/src/routes/api.js
const express = require('express');
const axios = require('axios');
const https = require('https');

const companyController = require('../controllers/companyController');
const addressController = require('../controllers/addressController');
const analysisController = require('../controllers/analysisController');
const assessmentController = require('../controllers/assessmentController');
const validateRequest = require('../middleware/validateRequest');
const { requireApiKey } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/ratelimit');
const { registerSatelliteDiagnosticsRoutes } = require('./satelliteImageRoutes');
const kartverketService = require('../services/kartverketService');

const router = express.Router();

// Cache for satellittbilder (24 timer TTL)
const imageCache = kartverketService.getSatelliteImageCache();

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

// Hjelpefunksjon for å konvertere lat/lon til tile-koordinater
function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
  return { x, y };
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
 * FUNGERENDE Satellite Image Proxy
 * Bruker statiske kartfliser fra Kartverket WMTS
 */
router.get('/satellite-image', async (req, res) => {
  // CORS headers
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization, Accept',
    'Access-Control-Max-Age': '86400',
  });

  const startTime = Date.now();
  
  try {
    const { lat, lon, width = 800, height = 800, format } = req.query;
    const mockSatelliteImageUrl = (process.env.MOCK_SATELLITE_IMAGE_URL || '').trim();

    console.log('\n[Satellite] Request:', { lat, lon, width, height });

    if (mockSatelliteImageUrl) {
      console.log('[Satellite] Serving MOCK_SATELLITE_IMAGE_URL without contacting external services');
      const match = mockSatelliteImageUrl.match(/^data:([^;]+);base64,/i);
      const contentType = match ? match[1] : 'image/png';

      return res.json({
        success: true,
        data: {
          dataUrl: mockSatelliteImageUrl,
          contentType,
          width: Number(width) || 800,
          height: Number(height) || 800,
          source: 'Mock (environment)',
          cached: false,
          mock: true,
        },
      });
    }

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

    // Cache sjekk
    const cacheKey = `sat_${latitude.toFixed(3)}_${longitude.toFixed(3)}`;
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

    console.log('[Satellite] Cache MISS - fetching new image');

    // STRATEGIENDRING: Bruk statisk kartflis-URL direkte
    // Kartverket har forhåndsgenererte kartfliser som er mye mer pålitelige
    
    // Beregn zoom-nivå basert på ønsket detalj
    const zoom = 17; // Zoom 17 gir god detalj for bygninger
    
    // Konverter lat/lon til tile koordinater
    const tileCoords = latLonToTile(latitude, longitude, zoom);
    console.log('[Satellite] Tile coordinates:', tileCoords);

    // Liste over tile-servere å prøve (i prioritert rekkefølge)
    const tileServices = [
      {
        name: 'Kartverket Cache Ortofoto',
        buildUrl: (x, y, z) => `https://cache.kartverket.no/v1/wmts/1.0.0/nib/default/webmercator/${z}/${y}/${x}.jpeg`,
      },
      {
        name: 'NorgeKart Tiles',  
        buildUrl: (x, y, z) => `https://opencache.statkart.no/gatekeeper/gk/gk.open_nib?layers=ortofoto&zoom=${z}&x=${x}&y=${y}&format=image/jpeg`,
      },
      {
        name: 'Kartverket Topo4',
        buildUrl: (x, y, z) => `https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/${z}/${y}/${x}.png`,
      },
      {
        name: 'OpenStreetMap Norge',
        buildUrl: (x, y, z) => `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`,
      }
    ];

    let lastError = null;
    
    // Prøv hver tile-tjeneste
    for (const service of tileServices) {
      const tileUrl = service.buildUrl(tileCoords.x, tileCoords.y, zoom);
      console.log(`[Satellite] Trying ${service.name}: ${tileUrl}`);
      
      try {
        const response = await axios({
          method: 'GET',
          url: tileUrl,
          responseType: 'arraybuffer',
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SolarAssessment/1.0)',
            'Accept': 'image/jpeg,image/png,image/*',
            'Referer': 'https://www.norgeskart.no/',
          },
          // Viktig: Ignorer SSL-problemer i dev
          httpsAgent: process.env.NODE_ENV === 'development' ? 
            new https.Agent({ rejectUnauthorized: false }) : 
            undefined,
        });

        const contentType = response.headers['content-type'] || 'image/jpeg';
        
        if (!contentType.startsWith('image/')) {
          throw new Error(`Unexpected content type: ${contentType}`);
        }

        const imageBuffer = Buffer.from(response.data);
        
        if (imageBuffer.length < 100) {
          throw new Error('Image too small');
        }

        console.log(`[Satellite] ✅ SUCCESS with ${service.name}!`);
        
        // Konverter til base64
        const base64 = imageBuffer.toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;
        
        // Cache
        imageCache.set(cacheKey, { 
          dataUrl, 
          contentType, 
          source: service.name 
        });

        return res.json({
          success: true,
          data: {
            dataUrl,
            contentType,
            width: 256, // Tile size
            height: 256,
            source: service.name,
            cached: false,
            zoom,
            tile: tileCoords,
          },
        });

      } catch (error) {
        lastError = error;
        console.warn(`[Satellite] ${service.name} failed:`, error.message);
        continue;
      }
    }

    // Hvis alle tile-tjenester feiler, prøv en enkel WMS GetMap som siste utvei
    console.log('[Satellite] All tile services failed, trying simple WMS...');
    
    try {
      // Enkel WMS-forespørsel med minimale parametere
      const wmsUrl = `https://openwms.statkart.no/skwms1/wms.nib?` +
        `SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&` +
        `LAYERS=ortofoto&STYLES=&FORMAT=image/jpeg&` +
        `SRS=EPSG:4326&` +
        `WIDTH=512&HEIGHT=512&` +
        `BBOX=${longitude-0.005},${latitude-0.005},${longitude+0.005},${latitude+0.005}`;
      
      console.log('[Satellite] Simple WMS URL:', wmsUrl);
      
      const response = await axios({
        method: 'GET',
        url: wmsUrl,
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'image/*',
        },
        httpsAgent: process.env.NODE_ENV === 'development' ? 
          new https.Agent({ rejectUnauthorized: false }) : 
          undefined,
      });

      const imageBuffer = Buffer.from(response.data);
      const contentType = response.headers['content-type'] || 'image/jpeg';
      
      if (contentType.startsWith('image/') && imageBuffer.length > 1000) {
        console.log('[Satellite] ✅ WMS fallback worked!');
        
        const base64 = imageBuffer.toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;
        
        imageCache.set(cacheKey, { 
          dataUrl, 
          contentType, 
          source: 'WMS Fallback' 
        }, 300); // Shorter TTL for fallback
        
        return res.json({
          success: true,
          data: {
            dataUrl,
            contentType,
            width: 512,
            height: 512,
            source: 'WMS Fallback',
            cached: false,
          },
        });
      }
    } catch (wmsError) {
      console.error('[Satellite] WMS fallback also failed:', wmsError.message);
    }

    // Ultimate fallback: Embedded map image
    console.log('[Satellite] Using embedded fallback image');
    
    // Generer et enkelt kartbilde med Canvas (hvis sharp er tilgjengelig)
    try {
      const sharp = require('sharp');
      
      // Lag et enkelt kartbilde med koordinater
      const svg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${width}" height="${height}" fill="#E8F4EA"/>
          <rect x="50" y="50" width="${width-100}" height="${height-100}" 
                fill="#F5F5DC" stroke="#8B7355" stroke-width="2"/>
          <text x="${width/2}" y="30" text-anchor="middle" 
                font-family="Arial" font-size="16" font-weight="bold">
            Kartutsnitt - ${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°Ø
          </text>
          <rect x="${width/2-20}" y="${height/2-30}" width="40" height="60" 
                fill="#A0522D" stroke="#654321" stroke-width="2"/>
          <polygon points="${width/2-25},${height/2-30} ${width/2},${height/2-50} ${width/2+25},${height/2-30}" 
                   fill="#8B4513"/>
          <circle cx="${width/2}" cy="${height/2}" r="5" fill="#FF0000"/>
        </svg>
      `;
      
      const imageBuffer = await sharp(Buffer.from(svg))
        .jpeg({ quality: 90 })
        .toBuffer();
      
      const dataUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
      
      imageCache.set(cacheKey, { 
        dataUrl, 
        contentType: 'image/jpeg', 
        source: 'Generated Map' 
      }, 120);
      
      return res.json({
        success: true,
        data: {
          dataUrl,
          contentType: 'image/jpeg',
          width: Number(width),
          height: Number(height),
          source: 'Generated Map',
          cached: false,
        },
      });
      
    } catch (sharpError) {
      console.log('[Satellite] Sharp not available, using SVG fallback');
    }

    // Final fallback: SVG
    const svgFallback = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e0e0e0" stroke-width="0.5"/>
          </pattern>
        </defs>
        <rect width="${width}" height="${height}" fill="#f5f5f5"/>
        <rect width="${width}" height="${height}" fill="url(#grid)"/>
        <rect x="100" y="100" width="${width-200}" height="${height-200}" 
              fill="#d4c5b0" stroke="#8b7355" stroke-width="2" opacity="0.8"/>
        <polygon points="${width/2-40},${height/2-20} ${width/2},${height/2-60} ${width/2+40},${height/2-20}" 
                 fill="#a0522d" opacity="0.9"/>
        <rect x="${width/2-30}" y="${height/2-20}" width="60" height="80" 
              fill="#8b7355" opacity="0.9"/>
        <circle cx="${width/2}" cy="${height/2+20}" r="8" fill="#dc2626"/>
        <circle cx="${width/2}" cy="${height/2+20}" r="5" fill="#ffffff"/>
        <text x="${width/2}" y="40" text-anchor="middle" font-family="system-ui" font-size="18" font-weight="600" fill="#374151">
          Satellittbilde utilgjengelig
        </text>
        <text x="${width/2}" y="65" text-anchor="middle" font-family="system-ui" font-size="14" fill="#6b7280">
          ${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°Ø
        </text>
        <text x="${width/2}" y="${height-20}" text-anchor="middle" font-family="system-ui" font-size="12" fill="#9ca3af">
          Klikk "Se i Norgeskart" for fullversjon
        </text>
      </svg>
    `;

    const svgBase64 = Buffer.from(svgFallback).toString('base64');
    const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`;

    imageCache.set(cacheKey, { 
      dataUrl: svgDataUrl, 
      contentType: 'image/svg+xml', 
      source: 'SVG Fallback' 
    }, 60);

    return res.json({
      success: true,
      data: {
        dataUrl: svgDataUrl,
        contentType: 'image/svg+xml',
        width: Number(width),
        height: Number(height),
        source: 'SVG Fallback',
        error: 'All image services unavailable',
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
router.delete('/satellite-image/cache/clear', (req, res) => {
  if (!req.authenticated) {
    return res.status(403).json({
      success: false,
      error: 'Satellite image cache reset requires a valid API key',
    });
  }

  imageCache.flushAll();
  console.log('[Satellite] Cache cleared');
  res.json({
    success: true,
    message: 'Image cache cleared',
  });
});

registerSatelliteDiagnosticsRoutes(router, { imageCache, latLonToTile });

module.exports = router;
