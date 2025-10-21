# Håndtering av satellittbilde-cache

Denne prosedyren beskriver hvordan driften kan verifisere og tømme cachen for satellittbilder i produksjon.

## Forutsetninger

- Tilgang til API-nøkkelen (`API_ACCESS_KEY`) som brukes av driftsverktøy.
- Tilgang til produksjonsmiljøets base-URL (for Render: `https://solar-assessment-backend.onrender.com/api`).
- (Valgfritt) Mulighet til å sette miljøvariabelen `ENABLE_SATELLITE_DIAGNOSTICS=true` for å aktivere diagnostikkendepunktene.

## Sjekk cache-status

1. Sett `ENABLE_SATELLITE_DIAGNOSTICS=true` på instansen dersom diagnoserutene ikke allerede er åpne.
2. Kjør `curl "${API_BASE_URL}/satellite-image/cache/stats" -H "x-api-key: ${API_ACCESS_KEY}"`.
3. Tolke svaret:
   - `keys`: antall nøkler i cachen.
   - `hits/misses`: hvor ofte vi treffer/ikke treffer NodeCache.
   - `ksize/vsize`: intern NodeCache-metrikk for minnebruk.

Hvis du ikke kan aktivere diagnostikkrutene, kan du gå direkte til invalidasjonstrinnet under.

## Tømme cache

### Alternativ A – CLI

1. Logg inn på instansen (SSH eller Render shell).
2. Eksporter nødvendige variabler:
   ```bash
   export CACHE_ADMIN_BASE_URL="https://solar-assessment-backend.onrender.com/api"
   export CACHE_ADMIN_API_KEY="<hemmelig nøkkel>"
   ```
3. Kjør `node backend/src/scripts/clearSatelliteCache.js`.
4. Verifiser at skriptet returnerer `{"success": true, "message": "Image cache cleared"}`.

### Alternativ B – Manuelt API-kall

1. Kjør `curl -X DELETE "${API_BASE_URL}/satellite-image/cache/clear" -H "x-api-key: ${API_ACCESS_KEY}"`.
2. Bekreft at svaret er `{"success": true, "message": "Image cache cleared"}`.

## Etterkontroll

- Utfør et nytt kall mot `.../satellite-image/cache/stats` (dersom tilgjengelig) for å se at `keys` har falt til `0`.
- Overvåk loggene for nye forespørsler for å bekrefte at cache gjenoppbygges uten feil.
