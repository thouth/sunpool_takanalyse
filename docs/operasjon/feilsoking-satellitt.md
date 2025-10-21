# Feilsøking av satellitt- og karttjenester

Dette dokumentet beskriver hvordan du aktiverer og bruker diagnostikk-endepunktene for satellittjenestene, samt hvilke signaler du
skal se etter i logger og overvåking. Endepunktene er deaktiverte som standard, men kan skrus på i staging og produksjon ved
behov for feilsøking.

## Aktivering av diagnostikk

1. Sett miljøvariabelen `ENABLE_SATELLITE_DIAGNOSTICS` til `true` i miljøet du vil feilsøke (Render, Docker Compose, etc.).
2. Deploy eller restart tjenesten slik at backend plukker opp den nye verdien.
3. Bekreft at endepunktet svarer ved å kjøre `curl https://<host>/api/satellite-image/debug`.

Når variabelen er `false`, svarer endepunktene med HTTP 404 og en kort feilmelding. Dette hindrer utilsiktet eksponering i miljøer
hvor diagnostikk ikke skal være tilgjengelig.

## Endepunkter

### `GET /api/satellite-image/cache/stats`

Returnerer statistikk for `NodeCache`-instansen som brukes til satellittbilder.

```bash
curl -H "x-api-key: <valgfri nøkkel>" \
  https://<host>/api/satellite-image/cache/stats
```

**Respons (eksempel)**

```json
{
  "success": true,
  "data": {
    "keys": 42,
    "hits": 128,
    "misses": 19,
    "ksize": 21,
    "vsize": 4200
  },
  "diagnosticsEnabled": true
}
```

### `GET /api/satellite-image/debug`

Gir en enkel sanity-check på hvilke URL-er som brukes for Kartverket WMS og cache-tjenester, samt konverterer forespurte
koordinater til flis-koordinater.

```bash
curl "https://<host>/api/satellite-image/debug?lat=59.91&lon=10.75"
```

**Respons (eksempel)**

```json
{
  "success": true,
  "message": "Debug endpoint for satellite images",
  "diagnosticsEnabled": true,
  "testUrls": {
    "tile17": "https://cache.kartverket.no/v1/wmts/...",
    "wms": "https://openwms.statkart.no/skwms1/wms.nib?...",
    "osm": "https://a.tile.openstreetmap.org/..."
  },
  "coordinates": {
    "lat": "59.91",
    "lon": "10.75"
  },
  "tileCoords": {
    "x": 42666,
    "y": 21788
  }
}
```

Bruk URL-ene for å teste direkte i nettleser eller Postman dersom bildeendepunktet feiler.

## Logger

`KartverketService` logger nå eksplisitt hvilken eksterne kilde som brukes, HTTP-status, responstid og eventuell feiltekst. Eksempel
på vellykket oppslag:

```
[KartverketService] geocodeAddress succeeded { source: 'Kartverket Adresse API', status: 200, durationMs: 218 }
```

Eksempel på feil:

```
[KartverketService] getElevation failed { source: 'Kartverket Elevation API', status: 503, durationMs: 1042, errorMessage: 'Request failed with status code 503' }
```

## Overvåking

Et GitHub Actions-workflow (`.github/workflows/satellite-diagnostics-monitor.yml`) kaller debug-endepunktet én gang per døgn. Jobben
failer dersom responsen ikke er HTTP 200 eller `success: true`, og GitHub sender da varsel til repo-eiere. Sett hemmeligheten
`SATELLITE_DEBUG_URL` i repoet til miljøet du ønsker å overvåke (for eksempel produksjon).
