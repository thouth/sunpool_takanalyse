// backend/src/controllers/analysisController.js
const kartverketService = require('../services/kartverketService');
const imageAnalysisService = require('../services/imageAnalysisService');
const weatherService = require('../services/weatherService');

exports.analyzeRoof = async (req, res, next) => {
  try {
    const { coordinates } = req.body;

    console.log(`Analyzing roof at coordinates: ${coordinates.lat}, ${coordinates.lon}`);

    const imageUrl = kartverketService.getSatelliteImageUrl(coordinates);
    const norgeskartUrl = kartverketService.getNorgeskartUrl(coordinates);
    const analysis = await imageAnalysisService.analyzeRoof(imageUrl, coordinates);

    res.json({
      success: true,
      data: {
        imageUrl,
        norgeskartUrl,
        analysis,
      },
    });
  } catch (error) {
    console.error('Roof analysis error:', error);
    next(error);
  }
};

exports.analyzeLocation = async (req, res, next) => {
  try {
    const { coordinates, includeWeather = false } = req.body;

    console.log(`Analyzing location at coordinates: ${coordinates.lat}, ${coordinates.lon}`);

    const locationData = await kartverketService.analyzeLocation(coordinates);
    let weather = null;

    if (includeWeather) {
      weather = await weatherService.getWeatherSummary(coordinates);
    }

    res.json({
      success: true,
      data: {
        ...locationData,
        weather,
      },
    });
  } catch (error) {
    console.error('Location analysis error:', error);
    next(error);
  }
};
