// backend/src/services/brregService.js
const axios = require('axios');

class BrregService {
  constructor() {
    this.baseUrl = process.env.BRREG_API_URL || 'https://data.brreg.no/enhetsregisteret/api';
    this.useMock = process.env.MOCK_EXTERNAL_APIS === 'true';
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
        registreringsdato: response.data.stiftelsesdato,
        kilde: 'brreg',
      };
    } catch (error) {
      if (error.response && error.response.status === 404) {
        const notFoundError = new Error('Organization number not found');
        notFoundError.status = 404;
        throw notFoundError;
      }

      if (this.shouldMock(error)) {
        console.warn('BrregService: Falling back to mock data', error.message || error.code);
        return this.buildMockCompany(orgNumber);
      }

      throw new Error('Failed to verify company against Brønnøysundregisteret');
    }
  }

  shouldMock(error) {
    if (this.useMock) {
      return true;
    }

    if (!error.response) {
      return true;
    }

    if (error.code && ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code)) {
      return true;
    }

    if (error.response.status >= 500) {
      return true;
    }

    return false;
  }

  buildMockCompany(orgNumber) {
    const mockNames = [
      'Solkraft',
      'Nordlys Energi',
      'Grønnbygg',
      'Fjordlys',
      'Aurora Tech',
    ];

    const index = this.hash(orgNumber) % mockNames.length;
    const kommuneData = this.pickKommune(index);

    return {
      valid: true,
      navn: `${mockNames[index]} ${orgNumber.slice(-3)}`,
      organisasjonsnummer: orgNumber,
      forretningsadresse: {
        adresse: `${kommuneData.street} ${50 + (index * 3)}`,
        postnummer: kommuneData.postnummer,
        poststed: kommuneData.poststed,
        kommunenavn: kommuneData.kommune,
        kommunenummer: kommuneData.kommunenummer,
        land: 'Norge',
      },
      naeringskode: {
        kode: '35110',
        beskrivelse: 'Produksjon av elektrisitet',
      },
      ansatte: 15 + index * 8,
      registreringsdato: '2012-01-01',
      kilde: 'mock',
    };
  }

  pickKommune(index) {
    const kommuner = [
      { kommune: 'Oslo', kommunenummer: '0301', poststed: 'Oslo', postnummer: '0150', street: 'Karl Johans gate' },
      { kommune: 'Bergen', kommunenummer: '4601', poststed: 'Bergen', postnummer: '5010', street: 'Bryggen' },
      { kommune: 'Trondheim', kommunenummer: '5001', poststed: 'Trondheim', postnummer: '7013', street: 'Munkegata' },
      { kommune: 'Stavanger', kommunenummer: '1103', poststed: 'Stavanger', postnummer: '4006', street: 'Kirkegata' },
      { kommune: 'Tromsø', kommunenummer: '5401', poststed: 'Tromsø', postnummer: '9008', street: 'Storgata' },
    ];

    return kommuner[index % kommuner.length];
  }

  hash(value) {
    return value
      .split('')
      .reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0) >>> 0;
  }
}

module.exports = new BrregService();
