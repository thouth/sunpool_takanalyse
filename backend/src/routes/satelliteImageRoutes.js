// backend/src/routes/satelliteImageRoutes.js
const express = require('express');

function createDisabledHandler(featureFlagName) {
  return (req, res) => {
    res.status(404).json({
      success: false,
      error: 'Satellite diagnostics endpoint is disabled',
      featureFlag: featureFlagName,
    });
  };
}

function createDiagnosticsRouter({ imageCache, latLonToTile }) {
  const router = express.Router({ mergeParams: true });
  const featureFlagName = 'ENABLE_SATELLITE_DIAGNOSTICS';
  const diagnosticsEnabled = String(process.env[featureFlagName] || '').toLowerCase() === 'true';

  if (!diagnosticsEnabled) {
    const disabledHandler = createDisabledHandler(featureFlagName);
    router.get('/cache/stats', disabledHandler);
    router.get('/debug', disabledHandler);
    return router;
  }

  router.get('/cache/stats', (req, res) => {
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
      diagnosticsEnabled,
    });
  });

  router.get('/debug', (req, res) => {
    const { lat = 59.9139, lon = 10.7522 } = req.query;

    res.json({
      success: true,
      message: 'Debug endpoint for satellite images',
      diagnosticsEnabled,
      testUrls: {
        tile17: 'https://cache.kartverket.no/v1/wmts/1.0.0/nib/default/webmercator/17/42666/21788.jpeg',
        wms: `https://openwms.statkart.no/skwms1/wms.nib?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=ortofoto&STYLES=&FORMAT=image/jpeg&SRS=EPSG:4326&WIDTH=512&HEIGHT=512&BBOX=${lon-0.005},${lat-0.005},${lon+0.005},${lat+0.005}`,
        osm: 'https://a.tile.openstreetmap.org/15/16777/9552.png',
      },
      coordinates: { lat, lon },
      tileCoords: latLonToTile(parseFloat(lat), parseFloat(lon), 17),
    });
  });

  return router;
}

function registerSatelliteDiagnosticsRoutes(parentRouter, { imageCache, latLonToTile }) {
  const diagnosticsRouter = createDiagnosticsRouter({ imageCache, latLonToTile });
  parentRouter.use('/satellite-image', diagnosticsRouter);
}

module.exports = {
  createDiagnosticsRouter,
  registerSatelliteDiagnosticsRoutes,
};
