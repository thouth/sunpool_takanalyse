// frontend/src/components/SolarAssessmentApp.jsx
import React, { useEffect, useState } from 'react';
import { Sun, Building, MapPin, Wind, AlertCircle, CheckCircle, Search, Loader2, Zap, Cloud, Home, Camera, Map, Info, ThermometerSun, Droplets, Clock, ExternalLink } from 'lucide-react';
import { assessmentService, getDefaultHeaders } from '../services/api';
import {
  calculateAnnualProduction,
  calculateCo2Savings,
  calculateAnnualSavings,
  calculatePaybackPeriod,
  formatNumber,
  formatCurrency,
  formatPercentage,
  formatEnergy,
  formatTonsPerYear,
  formatYears,
} from '../utils/calculations';

const SolarAssessmentApp = () => {
  const [companyData, setCompanyData] = useState({
    name: '',
    orgNumber: '',
    address: '',
    kommune: '',
    fylke: ''
  });
  
  const [coordinates, setCoordinates] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const [assessmentResult, setAssessmentResult] = useState(null);
  const [errors, setErrors] = useState({});
  const [showApiInfo, setShowApiInfo] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [satelliteImageUrl, setSatelliteImageUrl] = useState(null);
  const [isSatelliteImageLoading, setIsSatelliteImageLoading] = useState(false);

  const performAssessment = async () => {
    setIsLoading(true);
    setErrors({});
    setAssessmentResult(null);
    setImageError(false);
    setSatelliteImageUrl(null);
    setIsSatelliteImageLoading(false);
    
    try {
      setCurrentStep('Starter vurdering...');
      
      const result = await assessmentService.performFullAssessment({
        orgNumber: companyData.orgNumber,
        address: companyData.address,
        companyName: companyData.name
      }, (step) => {
        setCurrentStep(step);
      });
      
      setAssessmentResult(result);
      setCoordinates(result.coordinates);

    } catch (error) {
      console.error('Assessment error:', error);
      setErrors({ general: error.message || 'En feil oppstod under vurderingen' });
    } finally {
      setIsLoading(false);
      setCurrentStep('');
    }
  };

  const handleSubmit = () => {
    const newErrors = {};
    
    if (!companyData.name) newErrors.name = 'Firmanavn er påkrevd';
    if (!companyData.orgNumber) newErrors.orgNumber = 'Organisasjonsnummer er påkrevd';
    if (companyData.orgNumber && (companyData.orgNumber.length !== 9 || !/^\d+$/.test(companyData.orgNumber))) {
      newErrors.orgNumber = 'Organisasjonsnummer må være 9 siffer';
    }
    if (!companyData.address) newErrors.address = 'Adresse er påkrevd';
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    performAssessment();
  };

  const getScoreColor = (score) => {
    if (score >= 8) return 'text-green-600';
    if (score >= 5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreDescription = (score) => {
    if (score >= 8) return 'Utmerket egnet for solceller';
    if (score >= 6) return 'Godt egnet for solceller';
    if (score >= 4) return 'Moderat egnet for solceller';
    return 'Mindre egnet for solceller';
  };

  // Generer riktig Norgeskart URL
  const getNorgeskartUrl = (coords) => {
    if (!coords) return '#';
    return `https://norgeskart.no/#!?project=norgeskart&layers=1002&zoom=17&lat=${coords.lat.toFixed(6)}&lon=${coords.lon.toFixed(6)}&markerLat=${coords.lat.toFixed(6)}&markerLon=${coords.lon.toFixed(6)}&panel=searchOptionsPanel`;
  };

  const weather = assessmentResult?.weather;
  const roofAnalysis = assessmentResult?.roofAnalysis?.analysis;
  const locationAnalysis = assessmentResult?.locationAnalysis;

  const capacity = roofAnalysis?.estimatedCapacity || 0;
  const specificYield = locationAnalysis?.averageProduction || 0;

  const annualProduction = calculateAnnualProduction(capacity, specificYield, weather);
  const co2Savings = calculateCo2Savings(annualProduction);
  const annualSavings = calculateAnnualSavings(annualProduction);
  const paybackPeriod = calculatePaybackPeriod(capacity, specificYield, weather) || null;

  const formattedWeatherUpdatedAt = weather?.updatedAt
    ? new Date(weather.updatedAt).toLocaleString('no-NO')
    : null;

  // Forbedret satellittbilde-håndtering
  useEffect(() => {
    const loadSatelliteImage = async () => {
      const imageEndpoint = assessmentResult?.roofAnalysis?.imageUrl;

      if (!imageEndpoint) {
        console.log('[Frontend] No image endpoint available');
        setSatelliteImageUrl(null);
        setIsSatelliteImageLoading(false);
        return;
      }

      try {
        setImageError(false);
        setIsSatelliteImageLoading(true);

        console.log('[Frontend] Loading satellite image from:', imageEndpoint);

        let imageUrl;
        try {
          imageUrl = new URL(imageEndpoint);
        } catch (error) {
          imageUrl = new URL(imageEndpoint, window.location.origin);
        }

        // Legg til format parameter for å få data-URL
        imageUrl.searchParams.set('format', 'data-url');

        console.log('[Frontend] Fetching from proxy:', imageUrl.toString());

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 65000); // 65 sekunder

        try {
          const response = await fetch(imageUrl.toString(), {
            headers: getDefaultHeaders(),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          console.log('[Frontend] Response status:', response.status);
          console.log('[Frontend] Response headers:', Object.fromEntries(response.headers.entries()));

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('[Frontend] API error response:', errorData);
            
            // Hvis WMS er nede, vis feilmelding men ikke krasj
            if (response.status === 503) {
              console.warn('[Frontend] WMS service temporarily unavailable');
              setImageError(true);
              setSatelliteImageUrl(null);
              return;
            }
            
            throw new Error(errorData?.error || `HTTP ${response.status}`);
          }

          const payload = await response.json();
          console.log('[Frontend] Payload structure:', {
            hasSuccess: 'success' in payload,
            success: payload?.success,
            hasData: !!payload?.data,
            hasDataUrl: !!payload?.data?.dataUrl,
            cached: payload?.data?.cached,
            dataKeys: payload?.data ? Object.keys(payload.data) : [],
          });

          // Prøv å finne dataUrl i ulike strukturer
          const dataUrl = payload?.data?.dataUrl || payload?.dataUrl;

          if (!dataUrl) {
            console.error('[Frontend] No dataUrl in response. Full payload:', payload);
            throw new Error('Manglende dataUrl i svar fra API');
          }

          // Valider data URL format
          if (!dataUrl.startsWith('data:image/')) {
            console.error('[Frontend] Invalid data URL format. Starts with:', dataUrl.substring(0, 50));
            throw new Error('Ugyldig bildedataformat');
          }

          console.log('[Frontend] Successfully loaded satellite image');
          console.log('[Frontend] Image size:', dataUrl.length, 'bytes');
          console.log('[Frontend] Image type:', dataUrl.substring(5, dataUrl.indexOf(';')));
          
          setSatelliteImageUrl(dataUrl);
          setImageError(false);

        } catch (fetchError) {
          clearTimeout(timeoutId);
          
          if (fetchError.name === 'AbortError') {
            console.error('[Frontend] Request timed out after 65 seconds');
            throw new Error('Forespørselen tok for lang tid');
          }
          
          throw fetchError;
        }

      } catch (error) {
        console.error('[Frontend] Failed to load satellite image:', error);
        console.error('[Frontend] Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
        
        setSatelliteImageUrl(null);
        setImageError(true);
      } finally {
        setIsSatelliteImageLoading(false);
      }
    };

    loadSatelliteImage();
  }, [assessmentResult?.roofAnalysis?.imageUrl]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-yellow-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center">
              <Sun className="w-10 h-10 text-yellow-500 mr-3" />
              <h1 className="text-3xl font-bold text-gray-800">Solcellevurdering for Næringsbygg</h1>
            </div>
            <button
              onClick={() => setShowApiInfo(!showApiInfo)}
              className="flex items-center px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition"
            >
              <Info className="w-4 h-4 mr-2" />
              API Info
            </button>
          </div>
          
          {showApiInfo && (
            <div className="mb-6 p-6 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-3 flex items-center">
                <Map className="w-5 h-5 mr-2" />
                Integrasjon med norske kartdata-APIer
              </h3>
              <div className="space-y-2 text-sm text-blue-800">
                <div className="flex items-start">
                  <CheckCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0 text-green-600" />
                  <div>
                    <strong>Brønnøysundregisteret:</strong> Verifisering av organisasjonsnummer via data.brreg.no
                  </div>
                </div>
                <div className="flex items-start">
                  <CheckCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0 text-green-600" />
                  <div>
                    <strong>Kartverket Adresse-API:</strong> Geokoding av adresse til koordinater
                  </div>
                </div>
                <div className="flex items-start">
                  <CheckCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0 text-green-600" />
                  <div>
                    <strong>Norge i bilder WMS:</strong> Ortofoto fra wms.geonorge.no for satellittbilder
                  </div>
                </div>
                <div className="flex items-start">
                  <CheckCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0 text-green-600" />
                  <div>
                    <strong>Kartverket Høydedata:</strong> Terrenganalyse og høydedata
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="space-y-6">
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Building className="inline w-4 h-4 mr-1" />
                  Firmanavn
                </label>
                <input
                  type="text"
                  value={companyData.name}
                  onChange={(e) => setCompanyData({...companyData, name: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Eksempel AS"
                />
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <CheckCircle className="inline w-4 h-4 mr-1" />
                  Organisasjonsnummer
                </label>
                <input
                  type="text"
                  value={companyData.orgNumber}
                  onChange={(e) => setCompanyData({...companyData, orgNumber: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="123456789"
                  maxLength="9"
                />
                {errors.orgNumber && <p className="text-red-500 text-sm mt-1">{errors.orgNumber}</p>}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <MapPin className="inline w-4 h-4 mr-1" />
                  Adresse
                </label>
                <input
                  type="text"
                  value={companyData.address}
                  onChange={(e) => setCompanyData({...companyData, address: e.target.value})}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSubmit();
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Eksempelveien 1, 0123 Oslo"
                />
                {errors.address && <p className="text-red-500 text-sm mt-1">{errors.address}</p>}
              </div>
            </div>
            
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-600 hover:to-blue-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {currentStep || 'Behandler...'}
                </>
              ) : (
                <>
                  <Search className="w-5 h-5 mr-2" />
                  Start Vurdering
                </>
              )}
            </button>
          </div>
          
          {errors.general && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
              <p className="text-red-700">{errors.general}</p>
            </div>
          )}
        </div>
        
        {assessmentResult && (
          <div className="space-y-6">
            {/* Score Card */}
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Egnethetsvurdering</h2>
                <div className={`text-6xl font-bold ${getScoreColor(assessmentResult.score)} mb-2`}>
                  {assessmentResult.score}/10
                </div>
                <p className="text-lg text-gray-600">{getScoreDescription(assessmentResult.score)}</p>
                {assessmentResult.coordinates && (
                  <p className="text-sm text-gray-500 mt-2">
                    Koordinater: {assessmentResult.coordinates.lat.toFixed(4)}°N, {assessmentResult.coordinates.lon.toFixed(4)}°Ø
                  </p>
                )}
              </div>
            </div>
            
            {/* Satellite Image */}
            {assessmentResult.roofAnalysis && assessmentResult.roofAnalysis.imageUrl && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                  <Camera className="w-5 h-5 mr-2 text-blue-500" />
                  Ortofoto fra Norge i bilder
                </h3>
                
                {!imageError ? (
                  satelliteImageUrl ? (
                    <div className="mb-4 rounded-lg overflow-hidden border-2 border-gray-200 bg-gray-50">
                      <img
                        src={satelliteImageUrl}
                        alt="Satellittbilde av takflate"
                        className="w-full h-auto"
                      />
                    </div>
                  ) : (
                    isSatelliteImageLoading && (
                      <div className="mb-4 bg-gray-100 rounded-lg p-12 text-center border-2 border-dashed border-gray-300">
                        <Loader2 className="w-8 h-8 mx-auto text-blue-500 mb-3 animate-spin" />
                        <p className="text-gray-700 font-medium mb-1">
                          Henter satellittbilde...
                        </p>
                        <p className="text-sm text-gray-500">
                          Dette kan ta et øyeblikk ved første innlasting
                        </p>
                      </div>
                    )
                  )
                ) : (
                  <div className="mb-4 bg-gray-100 rounded-lg p-12 text-center border-2 border-dashed border-gray-300">
                    <Camera className="w-16 h-16 mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-700 font-medium mb-2">
                      Satellittbildet er midlertidig utilgjengelig
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      WMS-tjenesten fra Norge i bilder svarer ikke for øyeblikket
                    </p>
                    <a
                      href={getNorgeskartUrl(assessmentResult.coordinates)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Åpne i Norgeskart
                    </a>
                  </div>
                )}
              </div>
            )}
            
            {/* Analysis Results */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Roof Analysis */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                  <Home className="w-5 h-5 mr-2 text-blue-500" />
                  Takanalyse
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Taktype:</span>
                    <span className="font-medium">{roofAnalysis.roofType}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Takareal:</span>
                    <span className="font-medium">{roofAnalysis.roofArea} m²</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Brukbart areal:</span>
                    <span className="font-medium">{roofAnalysis.usableArea}%</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Orientering:</span>
                    <span className="font-medium">{roofAnalysis.orientation}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Takvinkel:</span>
                    <span className="font-medium">{roofAnalysis.tiltAngle}°</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Hindringer:</span>
                    <span className="font-medium text-sm">{roofAnalysis.obstacles}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Takstand:</span>
                    <span className="font-medium">{roofAnalysis.roofCondition}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Estimert kapasitet:</span>
                    <span className="font-medium text-green-600">{formatNumber(capacity, { maximumFractionDigits: 1 })} kWp</span>
                  </div>
                </div>
              </div>

              {/* Location Analysis */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                  <MapPin className="w-5 h-5 mr-2 text-green-500" />
                  Stedanalyse
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Region:</span>
                    <span className="font-medium">{locationAnalysis.region}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Høyde over havet:</span>
                    <span className="font-medium">{locationAnalysis.elevation} m</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Årlige soltimer:</span>
                    <span className="font-medium">{locationAnalysis.annualSolarHours} timer</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Solinnstråling:</span>
                    <span className="font-medium">{locationAnalysis.solarIrradiation} W/m²</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Vindforhold:</span>
                    <span className="font-medium">{locationAnalysis.windCondition}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Snølast:</span>
                    <span className="font-medium">{locationAnalysis.snowLoad}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Forventet produksjon:</span>
                    <span className="font-medium text-blue-600">{formatNumber(specificYield)} kWh/kWp/år</span>
                  </div>
                </div>
              </div>
            </div>

            {weather && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                  <Cloud className="w-5 h-5 mr-2 text-indigo-500" />
                  Lokalt værgrunnlag
                </h3>
                <div className="grid md:grid-cols-3 gap-4 text-sm text-gray-700">
                  <div className="bg-indigo-50 rounded-lg p-4">
                    <div className="flex items-center text-indigo-700 font-semibold mb-2">
                      <ThermometerSun className="w-4 h-4 mr-2" />Temperatur
                    </div>
                    <p>Middel: {formatNumber(weather.temperature?.average, { maximumFractionDigits: 1 })}°C</p>
                    <p>Min: {formatNumber(weather.temperature?.min, { maximumFractionDigits: 1 })}°C</p>
                    <p>Maks: {formatNumber(weather.temperature?.max, { maximumFractionDigits: 1 })}°C</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center text-blue-700 font-semibold mb-2">
                      <Wind className="w-4 h-4 mr-2" />Vind og lys
                    </div>
                    <p>Vind snitt: {formatNumber(weather.wind?.average, { maximumFractionDigits: 1 })} m/s</p>
                    <p>Vind maks: {formatNumber(weather.wind?.max, { maximumFractionDigits: 1 })} m/s</p>
                    <p>Dagslys: {formatNumber(weather.daylightHours, { maximumFractionDigits: 1 })} t/dag</p>
                  </div>
                  <div className="bg-cyan-50 rounded-lg p-4">
                    <div className="flex items-center text-cyan-700 font-semibold mb-2">
                      <Droplets className="w-4 h-4 mr-2" />Nedbør
                    </div>
                    <p>Sannsynlighet: {formatPercentage(weather.precipitation?.probability ?? null)}</p>
                    <p>Forventet mengde: {formatNumber(weather.precipitation?.expected, { maximumFractionDigits: 1 })} mm/uke</p>
                    <p>Skydekke: {formatPercentage(weather.cloudCover ?? null)}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Datakilde: {weather.source} • Oppdatert {formattedWeatherUpdatedAt}
                </p>
              </div>
            )}

            {/* Recommendations */}
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                <Zap className="w-5 h-5 mr-2 text-yellow-600" />
                Anbefalinger og estimater
              </h3>

              <div className="grid md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg p-4">
                  <h4 className="font-semibold text-gray-700 mb-2">Årlig produksjon</h4>
                  <p className="text-2xl font-bold text-green-600">{formatEnergy(annualProduction)}</p>
                  <p className="text-xs text-gray-500 mt-1">Estimert strømproduksjon</p>
                </div>

                <div className="bg-white rounded-lg p-4">
                  <h4 className="font-semibold text-gray-700 mb-2">CO₂-besparelse</h4>
                  <p className="text-2xl font-bold text-blue-600">{formatTonsPerYear(co2Savings)}</p>
                  <p className="text-xs text-gray-500 mt-1">Redusert CO₂-utslipp</p>
                </div>

                <div className="bg-white rounded-lg p-4">
                  <h4 className="font-semibold text-gray-700 mb-2">Strømbesparelse</h4>
                  <p className="text-2xl font-bold text-purple-600">{formatCurrency(annualSavings)}</p>
                  <p className="text-xs text-gray-500 mt-1">Estimert årlig besparelse</p>
                </div>

                <div className="bg-white rounded-lg p-4">
                  <h4 className="font-semibold text-gray-700 mb-2">Tilbakebetalingstid</h4>
                  <p className="text-2xl font-bold text-orange-600 flex items-
