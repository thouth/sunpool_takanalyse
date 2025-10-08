// backend/src/services/imageAnalysisService.js
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
      
      // I produksjon ville vi:
      // 1. Lastet ned bildet fra imageUrl
      // 2. Kjørt ML-modell for segmentering
      // 3. Detektert taktype, helning, orientering
      
      // For nå bruker vi avansert simulering basert på lokasjon
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
    // Bruk koordinater for å lage konsistent data
    const seed = this.hashCoordinates(coordinates);
    
    // Bedre taktype-deteksjon basert på region og bygningstype
    const roofTypeWeights = this.getRoofTypeWeights(coordinates);
    const roofType = this.selectWeightedRandom(roofTypeWeights, seed);
    
    // Beregn optimal orientering basert på breddegrad
    const optimalOrientation = this.calculateOptimalOrientation(coordinates);
    
    // Takvinkel avhenger av taktype
    const tiltAngle = this.calculateTiltAngle(roofType, coordinates, seed);
    
    // Areal og kapasitet
    const baseArea = 300 + (seed % 400); // 300-700 m²
    const usablePercentage = roofType === 'Flatt tak' 
      ? 60 + (seed % 20) // Flatt tak: 60-80%
      : 75 + (seed % 20); // Skråtak: 75-95%
    
    const usableArea = baseArea * (usablePercentage / 100);
    
    // Kapasitet: ca 0.15-0.20 kWp per m²
    const capacityPerSqm = 0.16 + (seed % 5) / 100;
    const estimatedCapacity = Math.round(usableArea * capacityPerSqm);
    
    // Hindringer basert på taktype
    const obstacles = this.determineObstacles(roofType, seed);
    
    // Takstand
    const roofCondition = this.determineRoofCondition(seed);
    
    // Skyggeanalyse - mer realistisk
    const shading = this.analyzeShadingPattern(coordinates, seed);
    
    return {
      roofType,
      roofArea: Math.round(baseArea),
      usableArea: Math.round(usablePercentage),
      estimatedCapacity,
      orientation: optimalOrientation,
      tiltAngle,
      obstacles,
      roofCondition,
      shading,
      confidence: 0.80 + (seed % 15) / 100, // 80-95%
      analysisMethod: 'Simulated (ML-basert analyse kommer i produksjon)',
      timestamp: new Date().toISOString()
    };
  }

  getRoofTypeWeights(coordinates) {
    // Næringsbygg i Norge har oftere skråtak enn flatt tak
    const weights = {
      'Skråtak': 45,      // Mest vanlig
      'Saltak': 25,       // Tradisjonelt
      'Flatt tak': 15,    // Moderne næringsbygg
      'Valmtak': 10,      // Eldre bygg
      'Pulttak': 5        // Mindre vanlig
    };
    
    // Juster basert på region
    if (coordinates.lat > 62) {
      // Nord-Norge: Mer skråtak pga snø
      weights['Skråtak'] += 10;
      weights['Saltak'] += 5;
      weights['Flatt tak'] -= 10;
    }
    
    if (coordinates.lat < 59) {
      // Sør-Norge: Mer flatt tak på nye bygg
      weights['Flatt tak'] += 10;
      weights['Skråtak'] -= 5;
    }
    
    return weights;
  }

  calculateOptimalOrientation(coordinates) {
    // I Norge er sør-orientering optimal
    // Legg til litt variasjon basert på koordinater
    const orientations = [
      'Sør',           // 40% sjanse
      'Sør-sørøst',    // 20%
      'Sør-sørvest',   // 20%
      'Sørøst',        // 10%
      'Sørvest',       // 10%
    ];
    
    const weights = [40, 20, 20, 10, 10];
    const seed = this.hashCoordinates(coordinates);
    
    return this.selectWeightedRandomFromArray(orientations, weights, seed);
  }

  calculateTiltAngle(roofType, coordinates, seed) {
    if (roofType === 'Flatt tak') {
      // Flatt tak har minimal helning (0-5 grader)
      return seed % 6;
    }
    
    // Optimal vinkel ≈ breddegrad
    const optimalAngle = Math.round(coordinates.lat);
    
    // Legg til variasjon ±10 grader
    const variation = -10 + (seed % 21);
    const angle = optimalAngle + variation;
    
    // Begrens til realistisk område
    return Math.max(15, Math.min(50, angle));
  }

  determineObstacles(roofType, seed) {
    const obstacleOptions = [
      { text: 'Ingen større hindringer', weight: 35 },
      { text: 'Noen skygger fra nabobygninger', weight: 25 },
      { text: 'Skorstein og ventilasjon på taket', weight: 20 },
      { text: 'Takvindu og ventilasjonspiper', weight: 15 },
      { text: 'Delvis skygge fra trær', weight: 5 },
    ];
    
    if (roofType === 'Flatt tak') {
      // Flatt tak har ofte mer utstyr
      obstacleOptions[2].weight += 10; // Mer ventilasjon
      obstacleOptions[0].weight -= 10;
    }
    
    const weights = obstacleOptions.map(o => o.weight);
    const texts = obstacleOptions.map(o => o.text);
    
    return this.selectWeightedRandomFromArray(texts, weights, seed);
  }

  determineRoofCondition(seed) {
    const conditions = ['Utmerket', 'God', 'Tilfredsstillende', 'Trenger vedlikehold'];
    const weights = [30, 50, 15, 5];
    
    return this.selectWeightedRandomFromArray(conditions, weights, seed);
  }

  analyzeShadingPattern(coordinates, seed) {
    // Mer skygge i nord og vest, mindre i sør
    const baseShadow = 5 + (seed % 15);
    
    return {
      morning: Math.round(baseShadow * 1.3),    // Mer skygge om morgenen
      midday: Math.round(baseShadow * 0.6),     // Minst skygge ved middag
      afternoon: Math.round(baseShadow * 1.1),  // Noe skygge ettermiddag
      yearlyAverage: Math.round(baseShadow)     // Gjennomsnitt
    };
  }

  // Hjelpefunksjoner
  hashCoordinates(coordinates) {
    const str = `${coordinates.lat}${coordinates.lon}`;
    return str.split('').reduce((acc, char) => 
      ((acc << 5) - acc) + char.charCodeAt(0), 0) >>> 0;
  }

  selectWeightedRandom(weightsObj, seed) {
    const items = Object.keys(weightsObj);
    const weights = Object.values(weightsObj);
    return this.selectWeightedRandomFromArray(items, weights, seed);
  }

  selectWeightedRandomFromArray(items, weights, seed) {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const random = (seed % totalWeight);
    
    let cumulative = 0;
    for (let i = 0; i < items.length; i++) {
      cumulative += weights[i];
      if (random < cumulative) {
        return items[i];
      }
    }
    
    return items[0];
  }
}

module.exports = new ImageAnalysisService();
