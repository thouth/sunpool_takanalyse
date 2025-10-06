// backend/src/services/brregService.js
const axios = require('axios');

class BrregService {
  constructor() {
    this.baseUrl = process.env.BRREG_API_URL || 'https://data.brreg.no/enhetsregisteret/api';
  }

  async verifyCompany(orgNumber) {
    try {
      const response = await axios.get(`${this.baseUrl}/enheter/${orgNumber}`);
      
      return {
        valid: true,
        navn: response.data.navn,
        organisasjonsnummer: response.data.organisasjonsnummer,
        forretningsadresse: response.data.forretningsadresse,
        naeringskode: response.data.naeringskode1,
        ansatte: response.data.antallAnsatte,
        registreringsdato: response.data.stiftelsesdato
      };
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new Error('Organization number not found');
      }
      throw error;
    }
  }
}

module.exports = new BrregService();
