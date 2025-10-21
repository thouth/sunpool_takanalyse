// frontend/src/components/AssessmentResult/SatellitePreview.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Camera, ExternalLink, Loader2 } from 'lucide-react';

const buildFallbackNorgeskartUrl = (coordinates) => {
  if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lon !== 'number') {
    return null;
  }

  const lat = coordinates.lat.toFixed(6);
  const lon = coordinates.lon.toFixed(6);

  return `https://norgeskart.no/#!?project=norgeskart&layers=1002&zoom=18&lat=${lat}&lon=${lon}&markerLat=${lat}&markerLon=${lon}&panel=searchOptionsPanel&showSelection=false`;
};

const SatellitePreview = ({ imageEndpoint, norgeskartUrl, coordinates }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [imageSource, setImageSource] = useState(null);
  const [isPlaceholder, setIsPlaceholder] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const effectiveNorgeskartUrl = useMemo(() => {
    return norgeskartUrl || buildFallbackNorgeskartUrl(coordinates);
  }, [norgeskartUrl, coordinates]);

  useEffect(() => {
    let isMounted = true;
    let abortController = null;
    let timeoutId = null;

    const loadImage = async () => {
      if (!imageEndpoint) {
        setImageDataUrl(null);
        setImageSource(null);
        setIsPlaceholder(false);
        setErrorMessage(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);
      setImageDataUrl(null);
      setImageSource(null);
      setIsPlaceholder(false);

      try {
        let requestUrl;
        try {
          requestUrl = new URL(imageEndpoint);
        } catch (error) {
          const baseUrl = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost';
          requestUrl = new URL(imageEndpoint, baseUrl);
        }

        requestUrl.searchParams.set('format', 'data-url');

        abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
        if (abortController) {
          timeoutId = setTimeout(() => abortController.abort(), 30000);
        }

        const response = await fetch(requestUrl.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          mode: 'cors',
          cache: 'default',
          signal: abortController ? abortController.signal : undefined,
        });

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `HTTP ${response.status}`);
        }

        const payload = await response.json();

        if (!payload.success) {
          if (!isMounted) return;
          setErrorMessage(payload.error || 'Kunne ikke hente satellittbilde');
          setImageDataUrl(null);
          setImageSource(null);
          setIsPlaceholder(false);
          return;
        }

        const imageData = payload?.data;
        if (!imageData || !imageData.dataUrl) {
          throw new Error('Mangler bildedata i svar');
        }

        if (!imageData.dataUrl.startsWith('data:')) {
          throw new Error('Ugyldig bildeformat mottatt');
        }

        if (!isMounted) return;

        setImageDataUrl(imageData.dataUrl);
        setImageSource(imageData.source || 'Ukjent');

        const sourceLabel = (imageData.source || '').toLowerCase();
        setIsPlaceholder(sourceLabel.includes('placeholder') || sourceLabel.includes('svg fallback'));
      } catch (error) {
        if (!isMounted) return;

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (error.name === 'AbortError') {
          setErrorMessage('Tilkoblingen til karttjenesten ble avbrutt (timeout).');
        } else {
          setErrorMessage(error.message || 'Kunne ikke hente satellittbilde');
        }

        setImageDataUrl(null);
        setImageSource(null);
        setIsPlaceholder(false);
      } finally {
        if (!isMounted) return;
        setIsLoading(false);
      }
    };

    loadImage();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (abortController) {
        try {
          abortController.abort();
        } catch (error) {
          // Ignore abort errors during cleanup
        }
      }
    };
  }, [imageEndpoint]);

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
        <Camera className="w-5 h-5 mr-2 text-blue-500" />
        Kartgrunnlag
        {imageSource && !isPlaceholder && (
          <span className="ml-2 text-sm font-normal text-gray-500">(Kilde: {imageSource})</span>
        )}
      </h3>

      {isLoading ? (
        <div className="bg-gray-100 rounded-lg p-12 text-center border-2 border-dashed border-gray-300">
          <Loader2 className="w-8 h-8 mx-auto text-blue-500 mb-3 animate-spin" />
          <p className="text-gray-700 font-medium mb-1">Henter kartdata...</p>
          <p className="text-sm text-gray-500">Kontakter Kartverket WMS-tjeneste</p>
        </div>
      ) : imageDataUrl ? (
        <div className="space-y-4">
          <div className="relative rounded-lg overflow-hidden border-2 border-gray-200 bg-gray-50">
            {isPlaceholder && (
              <div className="absolute top-3 left-3 bg-yellow-500 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-lg uppercase tracking-wide">
                Fallback aktiv
              </div>
            )}
            <img
              src={imageDataUrl}
              alt="Kartutsnitt av området"
              className="w-full h-auto"
              onError={() => {
                setErrorMessage('Kunne ikke vise mottatt kartbilde.');
                setImageDataUrl(null);
              }}
            />
          </div>
          {isPlaceholder && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                ⚠️ Viser midlertidig kartillustrasjon fordi Kartverkets WMS-tjenester er utilgjengelige.
              </p>
            </div>
          )}
          {effectiveNorgeskartUrl && (
            <div className="flex justify-center">
              <a
                href={effectiveNorgeskartUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Se i Norgeskart (full oppløsning)
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-100 rounded-lg p-12 text-center border-2 border-dashed border-gray-300">
          <Camera className="w-16 h-16 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-700 font-medium mb-2">Kunne ikke laste kartdata</p>
          {errorMessage && (
            <p className="text-sm text-gray-500 mb-4" data-testid="satellite-error-message">
              {errorMessage}
            </p>
          )}
          {effectiveNorgeskartUrl && (
            <a
              href={effectiveNorgeskartUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Åpne i Norgeskart
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default SatellitePreview;
