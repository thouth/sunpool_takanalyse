// backend/src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "https://wms.geonorge.no", "https://*.kartverket.no"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api', limiter);

// Services
const brregService = require('./services/brregService');
const kartverketService = require('./services/kartverketService');
const imageAnalysisService = require('./services/imageAnalysisService');

// Routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Company verification endpoint
app.post('/api/verify-company', async (req, res) => {
  try {
    const { orgNumber } = req.body;
    
    if (!orgNumber || orgNumber.length !== 9) {
      return res.status(400).json({ error: 'Invalid organization number' });
    }
    
    const companyData = await brregService.verifyCompany(orgNumber);
    res.json(companyData);
  } catch (error) {
    console.error('Company verification error:', error);
    res.status(500).json({ error: 'Failed to verify company' });
  }
});

// Address geocoding endpoint
app.post('/api/geocode', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }
    
    const coordinates = await kartverketService.geocodeAddress(address);
    res.json(coordinates);
  } catch (error) {
    console.error('Geocoding error:', error);
    res.status(500).json({ error: 'Failed to geocode address' });
  }
});

// Satellite imagery analysis endpoint
app.post('/api/analyze-roof', async (req, res) => {
  try {
    const { coordinates } = req.body;
    
    if (!coordinates || !coordinates.lat || !coordinates.lon) {
      return res.status(400).json({ error: 'Valid coordinates required' });
    }
    
    // Get satellite image URL
    const imageUrl = kartverketService.getSatelliteImageUrl(coordinates);
    
    // Analyze image (this would use TensorFlow or similar in production)
    const analysis = await imageAnalysisService.analyzeRoof(imageUrl, coordinates);
    
    res.json({
      imageUrl,
      analysis
    });
  } catch (error) {
    console.error('Roof analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze roof' });
  }
});

// Location analysis endpoint
app.post('/api/analyze-location', async (req, res) => {
  try {
    const { coordinates } = req.body;
    
    const locationData = await kartverketService.analyzeLocation(coordinates);
    res.json(locationData);
  } catch (error) {
    console.error('Location analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze location' });
  }
});

// Combined assessment endpoint
app.post('/api/assess', async (req, res) => {
  try {
    const { orgNumber, address } = req.body;
    
    // Step 1: Verify company
    const companyData = await brregService.verifyCompany(orgNumber);
    
    // Step 2: Geocode address
    const coordinates = await kartverketService.geocodeAddress(address);
    
    // Step 3: Get and analyze satellite imagery
    const imageUrl = kartverketService.getSatelliteImageUrl(coordinates);
    const roofAnalysis = await imageAnalysisService.analyzeRoof(imageUrl, coordinates);
    
    // Step 4: Analyze location
    const locationAnalysis = await kartverketService.analyzeLocation(coordinates);
    
    // Step 5: Calculate score
    const score = calculateSolarScore(roofAnalysis, locationAnalysis);
    
    res.json({
      company: companyData,
      coordinates,
      roofAnalysis,
      locationAnalysis,
      score,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Assessment error:', error);
    res.status(500).json({ error: 'Assessment failed: ' + error.message });
  }
});

// Helper function to calculate solar score
function calculateSolarScore(roofData, locationData) {
  let score = 5;
  
  if (roofData.roofArea > 200) score += 0.8;
  if (roofData.estimatedCapacity > 30) score += 0.8;
  if (roofData.usableArea > 85) score += 0.8;
  if (['Sør', 'Sør-sørøst', 'Sør-sørvest'].includes(roofData.orientation)) score += 0.8;
  
  if (locationData.annualSolarHours > 1500) score += 0.8;
  if (['Lav', 'Moderat'].includes(locationData.windCondition)) score += 0.4;
  if (['Lav', 'Moderat'].includes(locationData.snowLoad)) score += 0.4;
  
  return Math.min(Math.max(Math.round(score), 1), 10);
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

module.exports = app;
