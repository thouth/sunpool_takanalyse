// backend/src/controllers/analysisController.js
const kartverketService = require('../services/kartverketService');
const imageAnalysisService = require('../services/imageAnalysisService');

exports.analyzeRoof = async (req, res, next) => {
  try {
    const { coordinates } = req.body;
    
    console.log(`Analyzing roof at coordinates: ${coordinates.lat}, ${coordinates.lon}`);
    
    // Get satellite image URL
    const imageUrl = kartverketService.getSatelliteImageUrl(coordinates);
    
    // Analyze the image
    const analysis = await imageAnalysisService.analyzeRoof(imageUrl, coordinates);
    
    res.json({
      success: true,
      data: {
        imageUrl,
        analysis
      }
    });
  } catch (error) {
    console.error('Roof analysis error:', error);
    next(error);
  }
};

exports.analyzeLocation = async (req, res, next) => {
  try {
    const { coordinates } = req.body;
    
    console.log(`Analyzing location at coordinates: ${coordinates.lat}, ${coordinates.lon}`);
    
    const locationData = await kartverketService.analyzeLocation(coordinates);
    
    res.json({
      success: true,
      data: locationData
    });
  } catch (error) {
    console.error('Location analysis error:', error);
    next(error);
  }
};
