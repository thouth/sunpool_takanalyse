// backend/src/services/kartverketService.js
const axios = require('axios');

class KartverketService {
  constructor() {
    this.addressApi = 'https://ws.geonorge.no/adresser/v1';
    this.wmsUrl = 'https://wms.geonorge.no/skwms1/wms.nib';
    this.elevationApi = 'https://ws.geonorge.no/hoydedata/v1';
  }

  async geocodeAddress(address) {
    try {
      const response = await axios.get(`${this.addressApi}/sok`, {
        params: {
          sok: address,
          treffPerSide: 1,
          side: 0
        }
      });

      if (response.data.adresser && response.data.adresser.length > 0) {
        const addr = response.data.adresser[0];
        return {
          lat: addr.representasjonspunkt.lat,
          lon: addr.representasjonspunkt.lon,
          kommune: addr.kommunenavn,
          fylke: addr.fylkesnavn,
          adressetekst: addr.adressetekst
        };
      }
      
      throw new Error('Address not found');
    } catch (error) {
      console.error('Geocoding error:', error);
      throw new Error('Failed to geocode address');
    }
  }

  getSatelliteImageUrl(coordinates) {
    const bbox = [
      coordinates.lon - 0.002,
      coordinates.lat - 0.002,
      coordinates.lon + 0.002,
      coordinates.lat + 0.002
    ].join(',');

    const params = new URLSearchParams({
      service: 'WMS',
      version: '1.3.0',
      request: 'GetMap',
      layers: 'ortofoto',
      styles: '',
      format: 'image/png',
      transparent: 'false',
      width: '1024',
      height: '1024',
      crs: 'EPSG:4326',
      bbox: bbox
    });

    return `${this.wmsUrl}?${params.toString()}`;
  }

  async getElevation(coordinates) {
    try {
      const response = await axios.get(`${this.elevationApi}/punkt`, {
        params: {
          koordsys: '4326',
          nord: coordinates.lat,
          ost: coordinates.lon,
          geojson: 'false'
        }
      });

      return {
        elevation: response.data.punkt.z || 0,
        datakilder: response.data.punkt.datakilde
      };
    } catch (error) {
      console.error('Elevation API error:', error);
      return { elevation: 0 };
    }
  }

  async analyzeLocation(coordinates) {
    const elevation = await this.getElevation(coordinates);
    
    // Determine region based on coordinates
    let region = 'Østlandet';
    let solarHours = 1650;
    let windCondition = 'Moderat';
    
    if (coordinates.lat > 63) {
      region = 'Nord-Norge';
      solarHours = 1300;
      windCondition = 'Høy';
    } else if (coordinates.lat > 61) {
      region = 'Trøndelag';
      solarHours = 1500;
      windCondition = 'Moderat';
    } else if (coordinates.lon < 7) {
      region = 'Vestlandet';
      solarHours = 1450;
      windCondition = 'Høy';
    } else if (coordinates.lat < 59) {
      region = 'Sørlandet';
      solarHours = 1700;
      windCondition = 'Lav';
    }

    return {
      region,
      elevation: elevation.elevation,
      annualSolarHours: solarHours,
      windCondition,
      averageProduction: Math.floor(solarHours * 0.85),
      snowLoad: region === 'Nord-Norge' ? 'Høy' : 'Moderat',
      solarIrradiation: 900 + Math.floor(Math.random() * 200)
    };
  }
}

module.exports = new KartverketService();
