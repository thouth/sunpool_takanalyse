// backend/src/services/assessmentService.js
class AssessmentService {
  constructor() {
    // In production, this would connect to a database
    this.assessments = new Map();
  }

  calculateScore(roofAnalysis, locationAnalysis) {
    let score = 5; // Base score
    
    // Roof factors (40% weight)
    if (roofAnalysis.roofArea > 200) score += 0.8;
    if (roofAnalysis.estimatedCapacity > 30) score += 0.8;
    if (roofAnalysis.usableArea > 85) score += 0.8;
    if (['Sør', 'Sør-sørøst', 'Sør-sørvest'].includes(roofAnalysis.orientation)) score += 0.8;
    if (['Flatt tak', 'Skråtak'].includes(roofAnalysis.roofType)) score += 0.4;
    
    // Shading factor
    if (roofAnalysis.shading && roofAnalysis.shading.yearlyAverage < 10) score += 0.4;
    
    // Location factors (40% weight)
    if (locationAnalysis.annualSolarHours > 1500) score += 0.8;
    if (['Lav', 'Moderat'].includes(locationAnalysis.windCondition)) score += 0.4;
    if (['Lav', 'Moderat'].includes(locationAnalysis.snowLoad)) score += 0.4;
    if (locationAnalysis.solarIrradiation > 1000) score += 0.4;
    if (locationAnalysis.elevation < 500) score += 0.4;
    
    // Roof condition factor (10% weight)
    if (['Utmerket', 'God'].includes(roofAnalysis.roofCondition)) score += 0.5;
    
    // Ensure score is between 1 and 10
    return Math.min(Math.max(Math.round(score), 1), 10);
  }

  generateRecommendations(score, roofAnalysis, locationAnalysis) {
    const recommendations = {
      score,
      suitability: this.getSuitabilityDescription(score),
      estimatedProduction: Math.round(roofAnalysis.estimatedCapacity * locationAnalysis.averageProduction),
      co2Savings: Math.round(roofAnalysis.estimatedCapacity * locationAnalysis.averageProduction * 0.4 / 1000),
      estimatedSavings: Math.round(roofAnalysis.estimatedCapacity * locationAnalysis.averageProduction * 1.2),
      paybackPeriod: this.calculatePaybackPeriod(roofAnalysis.estimatedCapacity, locationAnalysis.averageProduction),
      technicalRecommendations: [],
      nextSteps: []
    };
    
    // Technical recommendations based on score and analysis
    if (score >= 7) {
      recommendations.technicalRecommendations = [
        'Optimale forhold for standard monokrystallinske paneler',
        'Vurder PERC eller bifacial teknologi for økt ytelse',
        `Anbefalt inverter: ${Math.round(roofAnalysis.estimatedCapacity * 0.9)} kW`,
        'Streng-inverter system anbefales for optimal ytelse'
      ];
      
      recommendations.nextSteps = [
        'Kontakt sertifisert installatør for befaring',
        'Søk støtte fra Enova (inntil 35% av kostnaden)',
        'Vurder batterilager for økt selvforsyning',
        'Undersøk lokale nettleierabatter'
      ];
    } else if (score >= 4) {
      recommendations.technicalRecommendations = [
        'Vurder høyeffektive paneler for maksimal utnyttelse',
        'Mikroinvertere kan optimalisere produksjon ved skygge',
        'Øst/vest-oppsett kan gi jevnere produksjon',
        'Vurder tiltak for å redusere skyggeproblemer'
      ];
      
      recommendations.nextSteps = [
        'Be om profesjonell vurdering av potensialet',
        'Undersøk muligheter for å optimalisere takflaten',
        'Vurder alternative plasseringer (fasade, carport)',
        'Analyser kost/nytte nøye før investering'
      ];
    } else {
      recommendations.technicalRecommendations = [
        'Takflaten er mindre egnet for tradisjonelle solceller',
        'Vurder alternative energiløsninger',
        'Hvis solceller ønskes, kreves spesialtilpasning',
        'Fokuser på energieffektivisering først'
      ];
      
      recommendations.nextSteps = [
        'Vurder andre fornybare energikilder',
        'Fokuser på energieffektivisering av bygget',
        'Undersøk muligheter for solceller på andre bygninger',
        'Vurder investering i andeler i solcelleparker'
      ];
    }
    
    return recommendations;
  }

  getSuitabilityDescription(score) {
    if (score >= 8) return 'Utmerket egnet for solceller';
    if (score >= 6) return 'Godt egnet for solceller';
    if (score >= 4) return 'Moderat egnet for solceller';
    return 'Mindre egnet for solceller';
  }

  calculatePaybackPeriod(capacity, averageProduction) {
    const investmentCost = capacity * 12000; // NOK per kWp
    const enovaSupport = investmentCost * 0.35; // 35% support
    const netCost = investmentCost - enovaSupport;
    const yearlyProduction = capacity * averageProduction;
    const yearlySavings = yearlyProduction * 1.2; // NOK per kWh
    
    return Math.round(netCost / yearlySavings);
  }

  async saveAssessment(assessmentData) {
    const id = this.generateId();
    const timestamp = new Date().toISOString();
    
    const assessment = {
      id,
      ...assessmentData,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    
    this.assessments.set(id, assessment);
    
    console.log(`Assessment saved with ID: ${id}`);
    return assessment;
  }

  async getAssessment(id) {
    return this.assessments.get(id) || null;
  }

  async listAssessments(options = {}) {
    const { page = 1, limit = 10, sortBy = 'createdAt', order = 'desc' } = options;
    
    const assessmentsArray = Array.from(this.assessments.values());
    
    // Sort
    assessmentsArray.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      return order === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
    
    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedResults = assessmentsArray.slice(startIndex, endIndex);
    
    return {
      data: paginatedResults,
      pagination: {
        page,
        limit,
        total: assessmentsArray.length,
        totalPages: Math.ceil(assessmentsArray.length / limit)
      }
    };
  }

  async deleteAssessment(id) {
    const deleted = this.assessments.delete(id);
    if (!deleted) {
      throw new Error('Assessment not found');
    }
    console.log(`Assessment ${id} deleted`);
  }

  async getStatistics() {
    const assessmentsArray = Array.from(this.assessments.values());
    
    if (assessmentsArray.length === 0) {
      return {
        totalAssessments: 0,
        averageScore: 0,
        averageCapacity: 0,
        totalCapacity: 0,
        regionsAnalyzed: []
      };
    }
    
    const totalScore = assessmentsArray.reduce((sum, a) => sum + a.score, 0);
    const totalCapacity = assessmentsArray.reduce((sum, a) => 
      sum + (a.roofAnalysis?.analysis?.estimatedCapacity || 0), 0);
    
    const regions = [...new Set(assessmentsArray.map(a => a.locationAnalysis?.region))];
    
    return {
      totalAssessments: assessmentsArray.length,
      averageScore: (totalScore / assessmentsArray.length).toFixed(1),
      averageCapacity: (totalCapacity / assessmentsArray.length).toFixed(1),
      totalCapacity: totalCapacity.toFixed(1),
      regionsAnalyzed: regions,
      scoreDistribution: this.getScoreDistribution(assessmentsArray),
      monthlyTrend: this.getMonthlyTrend(assessmentsArray)
    };
  }

  async getRegionalStatistics(region) {
    const assessmentsArray = Array.from(this.assessments.values());
    const regionalAssessments = assessmentsArray.filter(a => 
      a.locationAnalysis?.region === region
    );
    
    if (regionalAssessments.length === 0) {
      return {
        region,
        totalAssessments: 0,
        averageScore: 0,
        averageCapacity: 0
      };
    }
    
    const totalScore = regionalAssessments.reduce((sum, a) => sum + a.score, 0);
    const totalCapacity = regionalAssessments.reduce((sum, a) => 
      sum + (a.roofAnalysis?.analysis?.estimatedCapacity || 0), 0);
    
    return {
      region,
      totalAssessments: regionalAssessments.length,
      averageScore: (totalScore / regionalAssessments.length).toFixed(1),
      averageCapacity: (totalCapacity / regionalAssessments.length).toFixed(1),
      topOrientations: this.getTopOrientations(regionalAssessments),
      averageProduction: this.getAverageProduction(regionalAssessments)
    };
  }

  getScoreDistribution(assessments) {
    const distribution = {
      '1-3': 0,
      '4-6': 0,
      '7-8': 0,
      '9-10': 0
    };
    
    assessments.forEach(a => {
      if (a.score <= 3) distribution['1-3']++;
      else if (a.score <= 6) distribution['4-6']++;
      else if (a.score <= 8) distribution['7-8']++;
      else distribution['9-10']++;
    });
    
    return distribution;
  }

  getMonthlyTrend(assessments) {
    const trend = {};
    
    assessments.forEach(a => {
      const date = new Date(a.createdAt || a.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!trend[monthKey]) {
        trend[monthKey] = { count: 0, totalScore: 0, totalCapacity: 0 };
      }
      
      trend[monthKey].count++;
      trend[monthKey].totalScore += a.score;
      trend[monthKey].totalCapacity += (a.roofAnalysis?.analysis?.estimatedCapacity || 0);
    });
    
    return trend;
  }

  getTopOrientations(assessments) {
    const orientations = {};
    
    assessments.forEach(a => {
      const orientation = a.roofAnalysis?.analysis?.orientation;
      if (orientation) {
        orientations[orientation] = (orientations[orientation] || 0) + 1;
      }
    });
    
    return Object.entries(orientations)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([orientation, count]) => ({ orientation, count }));
  }

  getAverageProduction(assessments) {
    const totalProduction = assessments.reduce((sum, a) => {
      const capacity = a.roofAnalysis?.analysis?.estimatedCapacity || 0;
      const avgProduction = a.locationAnalysis?.averageProduction || 0;
      return sum + (capacity * avgProduction);
    }, 0);
    
    return assessments.length > 0 ? Math.round(totalProduction / assessments.length) : 0;
  }

  generateId() {
    return `assessment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async generatePDF(assessmentId) {
    // In production, use a library like puppeteer or pdfkit
    // For now, return a placeholder
    const assessment = await this.getAssessment(assessmentId);
    
    if (!assessment) {
      throw new Error('Assessment not found');
    }
    
    // Placeholder PDF generation
    const pdfContent = `
      Solar Assessment Report
      =======================
      Assessment ID: ${assessmentId}
      Date: ${assessment.timestamp}
      Score: ${assessment.score}/10
      
      Company: ${assessment.company?.navn}
      Address: ${assessment.coordinates?.adressetekst}
      
      Roof Analysis:
      - Type: ${assessment.roofAnalysis?.analysis?.roofType}
      - Area: ${assessment.roofAnalysis?.analysis?.roofArea} m²
      - Capacity: ${assessment.roofAnalysis?.analysis?.estimatedCapacity} kWp
      
      Location Analysis:
      - Region: ${assessment.locationAnalysis?.region}
      - Solar Hours: ${assessment.locationAnalysis?.annualSolarHours}
      - Average Production: ${assessment.locationAnalysis?.averageProduction} kWh/kWp/year
    `;
    
    return Buffer.from(pdfContent);
  }

  async generateCSV(assessmentIds) {
    const headers = [
      'ID', 'Date', 'Score', 'Company', 'Address', 
      'Roof Type', 'Roof Area', 'Capacity', 'Region', 'Solar Hours'
    ];
    
    const rows = [headers.join(',')];
    
    for (const id of assessmentIds) {
      const assessment = await this.getAssessment(id);
      if (assessment) {
        const row = [
          assessment.id,
          assessment.timestamp,
          assessment.score,
          assessment.company?.navn || '',
          assessment.coordinates?.adressetekst || '',
          assessment.roofAnalysis?.analysis?.roofType || '',
          assessment.roofAnalysis?.analysis?.roofArea || '',
          assessment.roofAnalysis?.analysis?.estimatedCapacity || '',
          assessment.locationAnalysis?.region || '',
          assessment.locationAnalysis?.annualSolarHours || ''
        ].map(val => `"${val}"`).join(',');
        
        rows.push(row);
      }
    }
    
    return rows.join('\n');
  }
}

module.exports = new AssessmentService();
