// backend/src/controllers/addressController.js
const kartverketService = require('../services/kartverketService');

exports.geocodeAddress = async (req, res, next) => {
  try {
    const { address } = req.body;
    
    console.log(`Geocoding address: ${address}`);
    
    const coordinates = await kartverketService.geocodeAddress(address);
    
    res.json({
      success: true,
      data: coordinates
    });
  } catch (error) {
    console.error('Geocoding error:', error);
    
    if (error.message === 'Address not found') {
      return res.status(404).json({
        success: false,
        error: 'Adresse ikke funnet'
      });
    }
    
    next(error);
  }
};
