# Satellite image cache

Denne komponenten cacher resultatet fra `/api/satellite-image` for å redusere antall kall mot Kartverkets karttjenester og sikre raskere responstid. Cachen lever i API-prosessen og bygges rundt `NodeCache`.

## NodeCache-konfigurasjon

Caching-konfigurasjonen er samlet i [`backend/src/services/kartverketService.js`](../../backend/src/services/kartverketService.js) og eksponeres via `getSatelliteImageCache()`. Følgende innstillinger brukes som standard:

| Setting | Verdi | Beskrivelse |
| --- | --- | --- |
| `stdTTL` | `86400` sekunder (24 timer) | Primær TTL for vanlige satellittbilder. Kan overstyres med `SATELLITE_CACHE_TTL_SECONDS`. |
| `checkperiod` | `3600` sekunder (1 time) | Hvor ofte NodeCache rydder utløpte nøkler. Kan overstyres med `SATELLITE_CACHE_CHECK_PERIOD_SECONDS`. |
| `useClones` | `false` | Hindrer dyre kopier av base64-bilder ved inn/ut av cachen. |

I tillegg lagres WMS-fallback-bilder med en kortere TTL (`300` sekunder) direkte ved `imageCache.set(...)`-kallet i API-routen. Dette hindrer at reservebilder ligger lenge dersom hovedtjenestene kommer tilbake.

## Invalidasjonsstrategi

1. **Automatisk utløp:** Alle cachede satellittbilder utløper etter 24 timer. NodeCache sin `checkperiod` sørger for at gamle nøkler fjernes jevnlig uten ekstra jobb.
2. **Selektiv fallback-ttl:** Dersom alle primære karttjenester feiler og vi må bruke WMS-fallback, legges bildet i cache med TTL på 5 minutter for å unngå å låse oss til en dårlig kilde.
3. **Manuell invalidasjon:** Operatører kan tømme hele cachen ved behov. Dette gjøres via det beskyttede endepunktet `DELETE /api/satellite-image/cache/clear` (krever gyldig API-nøkkel) eller via CLI-kommanden `node backend/src/scripts/clearSatelliteCache.js` som kapsler den samme kall-logikken.

## Observability

Aktiver `ENABLE_SATELLITE_DIAGNOSTICS=true` for å slå på diagnostikkruter som `/api/satellite-image/cache/stats`. Denne returnerer nøkkelantall samt NodeCache-statistikk (`hits`, `misses`, `ksize`, `vsize`) og kan brukes i feilsøking.
