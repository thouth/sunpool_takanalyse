const brregService = require('../services/brregService');

exports.verifyCompany = async (req, res, next) => {
  try {
    const { orgNumber } = req.body;
    
    console.log(`Verifying company with org number: ${orgNumber}`);
    
    const companyData = await brregService.verifyCompany(orgNumber);
    
    res.json({
      success: true,
      data: companyData
    });
  } catch (error) {
    console.error('Company verification error:', error);
    
    if (error.message === 'Organization number not found') {
      return res.status(404).json({
        success: false,
        error: 'Organisasjonsnummer ikke funnet'
      });
    }
    
    next(error);
  }
};

