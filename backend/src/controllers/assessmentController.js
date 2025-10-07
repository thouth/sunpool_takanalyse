// backend/src/controllers/assessmentController.js
const brregService = require('../services/brregService');
const kartverketService = require('../services/kartverketService');
const imageAnalysisService = require('../services/imageAnalysisService');
const assessmentService = require('../services/assessmentService');
const weatherService = require('../services/weatherService');

exports.performAssessment = async (req, res, next) => {
  try {
    const { orgNumber, address } = req.body;

    console.log(`Performing full assessment for org: ${orgNumber}, address: ${address}`);

    const companyData = await brregService.verifyCompany(orgNumber);
    const coordinates = await kartverketService.geocodeAddress(address);

    const imageUrl = kartverketService.getSatelliteImageUrl(coordinates);
    const roofAnalysis = await imageAnalysisService.analyzeRoof(imageUrl, coordinates);

    const locationAnalysis = await kartverketService.analyzeLocation(coordinates);
    const weather = await weatherService.getWeatherSummary(coordinates);

    const score = assessmentService.calculateScore(roofAnalysis, locationAnalysis, weather);
    const recommendations = assessmentService.generateRecommendations(score, roofAnalysis, locationAnalysis, weather);

    const result = {
      company: companyData,
      coordinates,
      roofAnalysis: {
        imageUrl,
        analysis: roofAnalysis,
      },
      locationAnalysis,
      weather,
      score,
      recommendations,
      timestamp: new Date().toISOString(),
    };

    if (req.body.save) {
      const saved = await assessmentService.saveAssessment(result);
      result.id = saved.id;
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Assessment error:', error);
    next(error);
  }
};

exports.getAssessment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const assessment = await assessmentService.getAssessment(id);

    if (!assessment) {
      return res.status(404).json({
        success: false,
        error: 'Assessment not found',
      });
    }

    res.json({
      success: true,
      data: assessment,
    });
  } catch (error) {
    next(error);
  }
};

exports.listAssessments = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, sortBy = 'createdAt', order = 'desc' } = req.query;

    const assessments = await assessmentService.listAssessments({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sortBy,
      order,
    });

    res.json({
      success: true,
      data: assessments,
    });
  } catch (error) {
    next(error);
  }
};

exports.saveAssessment = async (req, res, next) => {
  try {
    const assessmentData = req.body;
    const saved = await assessmentService.saveAssessment(assessmentData);

    res.status(201).json({
      success: true,
      data: saved,
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteAssessment = async (req, res, next) => {
  try {
    const { id } = req.params;
    await assessmentService.deleteAssessment(id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

exports.getStatistics = async (req, res, next) => {
  try {
    const stats = await assessmentService.getStatistics();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

exports.getRegionalStats = async (req, res, next) => {
  try {
    const { region } = req.params;
    const stats = await assessmentService.getRegionalStatistics(region);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

exports.exportPDF = async (req, res, next) => {
  try {
    const { id } = req.params;
    const pdfBuffer = await assessmentService.generatePDF(id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=assessment-${id}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

exports.exportCSV = async (req, res, next) => {
  try {
    const { assessmentIds } = req.body;
    const csvData = await assessmentService.generateCSV(assessmentIds);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=assessments.csv');
    res.send(csvData);
  } catch (error) {
    next(error);
  }
};
