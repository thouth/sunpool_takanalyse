// backend/src/services/imageAnalysisService.js
const axios = require('axios');
// In production, you would import: const tf = require('@tensorflow/tfjs-node');

class ImageAnalysisService {
  constructor() {
    this.analysisCache = new Map();
  }

  async analyzeRoof(imageUrl, coordinates) {
    try {
      // Check cache
      const cacheKey = `${coordinates.lat}-${coordinates.lon}`;
      if (this.analysisCache.has(cacheKey)) {
        console.log('Returning cached roof analysis');
        return this.analysisCache.get(cacheKey);
      }

      console.log(`Analyzing roof at: ${coordinates.lat}, ${coordinates.lon}`);
      
      // In production, you would:
      // 1. Download the image from imageUrl
      // 2. Process with ML model (TensorFlow/PyTorch)
      // 3. Detect roof boundaries, calculate area, identify obstacles
      
      // For now, we'll generate realistic simulated data based on coordinates
      const analysis = await this.simulateRoofAnalysis(coordinates);
      
      // Cache the result
      this.analysisCache.set(cacheKey, analysis);
      
      // Clear old cache entries if too many
      if (this.analysisCache.size > 100) {
        const firstKey = this.analysisCache.keys().next().value;
        this.analysisCache.delete(firstKey);
      }
      
      return analysis;
    } catch (error) {
      console.error('Image analysis error:', error);
      throw new Error(`Failed to analyze roof imagery: ${error.message}`);
    }
  }

  async simulateRoofAnalysis(coordinates) {
    // Simulate realistic roof analysis based on location
    const roofTypes = ['Flatt tak', 'Skråtak', 'Saltak', 'Valmtak', 'Pulttak'];
    const orientations = ['Sør', 'Sør-sørøst', 'Sør-sørvest', 'Sørøst', 'Sørvest'];
    
    // Generate values with some randomness but realistic constraints
    const baseArea = 200 + Math.random() * 400; // 200-600 m²
    const usablePercentage = 70 + Math.random() * 25; // 70-95%
    const usableArea = baseArea * (usablePercentage / 100);
    
    // Capacity calculation: roughly 6-7 m² per kWp
    const capacityPerSquareMeter = 0.15 + Math.random() * 0.05; // 0.15-0.20 kWp/m²
    const estimatedCapacity = Math.round(usableArea * capacityPerSquareMeter);
    
    // Tilt angle depends on latitude (optimal is roughly latitude * 0.9)
    const optimalTilt = Math.round(coordinates.lat * 0.9);
    const tiltAngle = optimalTilt + Math.round((Math.random() - 0.5) * 10);
    
    return {
      roofType: roofTypes[Math.floor(Math.random() * roofTypes.length)],
      roofArea: Math.round(baseArea),
      usableArea: Math.round(usablePercentage),
      estimatedCapacity: estimatedCapacity,
      orientation: orientations[Math.floor(Math.random() * orientations.length)],
      tiltAngle: Math.max(15, Math.min(45, tiltAngle)), // Constrain between 15-45 degrees
      obstacles: this.generateObstacles(),
      roofCondition: this.generateRoofCondition(),
      shading: this.generateShadingAnalysis(),
      confidence: 0.75 + Math.random() * 0.20, // 75-95% confidence
      analysisMethod: 'Simulated', // In production: 'ML Model v2.1'
      timestamp: new Date().toISOString()
    };
  }

  generateObstacles() {
    const obstacles = [
      'Ingen hindringer',
      'Noen skygger fra nabobygninger',
      'Skorstein og ventilasjon på taket',
      'Delvis skygge fra trær',
      'Takvindu og ventilasjon'
    ];
    
    return obstacles[Math.floor(Math.random() * obstacles.length)];
  }

  generateRoofCondition() {
    const conditions = ['Utmerket', 'God', 'Tilfredsstillende', 'Trenger vedlikehold'];
    const weights = [0.3, 0.5, 0.15, 0.05]; // Weighted probability
    
    const random = Math.random();
    let sum = 0;
    
    for (let i = 0; i < conditions.length; i++) {
      sum += weights[i];
      if (random < sum) return conditions[i];
    }
    
    return conditions[1]; // Default to 'God'
  }

  generateShadingAnalysis() {
    return {
      morning: Math.round(Math.random() * 20), // 0-20% shading
      midday: Math.round(Math.random() * 10),  // 0-10% shading
      afternoon: Math.round(Math.random() * 20), // 0-20% shading
      yearlyAverage: Math.round(Math.random() * 15) // 0-15% average shading
    };
  }

  // Production ML implementation example (commented out)
  async analyzeRoofWithML(imageBuffer, coordinates) {
    // const tf = require('@tensorflow/tfjs-node');
    // 
    // // Load pre-trained model
    // const model = await tf.loadLayersModel('file://./models/roof-segmentation/model.json');
    // 
    // // Preprocess image
    // const tensor = tf.node.decodeImage(imageBuffer);
    // const resized = tf.image.resizeBilinear(tensor, [512, 512]);
    // const normalized = resized.div(255.0);
    // const batched = normalized.expandDims(0);
    // 
    // // Run inference
    // const predictions = await model.predict(batched);
    // 
    // // Post-process predictions
    // const segmentationMask = predictions[0]; // Roof area segmentation
    // const roofTypeProbs = predictions[1];    // Roof type classification
    // const orientationAngle = predictions[2]; // Orientation regression
    // 
    // // Calculate roof area from segmentation mask
    // const pixelsPerMeter = this.calculatePixelsPerMeter(coordinates);
    // const roofPixels = tf.sum(segmentationMask).dataSync()[0];
    // const roofArea = roofPixels / (pixelsPerMeter * pixelsPerMeter);
    // 
    // // Determine roof type from probabilities
    // const roofTypes = ['Flatt tak', 'Skråtak', 'Saltak', 'Valmtak', 'Pulttak'];
    // const roofTypeIndex = tf.argMax(roofTypeProbs, 1).dataSync()[0];
    // const roofType = roofTypes[roofTypeIndex];
    // 
    // // Clean up tensors
    // tensor.dispose();
    // resized.dispose();
    // normalized.dispose();
    // batched.dispose();
    // predictions.forEach(p => p.dispose());
    // 
    // return {
    //   roofType,
    //   roofArea: Math.round(roofArea),
    //   // ... other analysis results
    // };
  }
}

module.exports = new ImageAnalysisService();
