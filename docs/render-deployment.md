# Deploy til Render.com

Denne veiledningen gir en komplett oppskrift på hvordan du produksjonssetter både backend (Express) og frontend (React) på Render.com med utgangspunkt i dette repositoriet.

## 0. Forberedelser

1. **Rydd i koden** – sørg for at `main`- eller `production`-branch bygger lokalt, og at `.env.example`-filene er oppdatert.
2. **Opprett Render-konto** – registrer deg på [render.com](https://render.com) og koble til GitHub/GitLab/Bitbucket-kontoen som inneholder repoet.
3. **Planlegg miljøvariabler** – bestem hvilke nøkler som skal brukes i produksjon (API-nøkler, URL-er, cache-innstillinger osv.).
4. **Opprett API-nøkkel (valgfritt)** – dersom du ønsker å begrense API-tilgang, avtal hvilken verdi som skal brukes i `API_ACCESS_KEY`.

> 💡 Tips: Lag en egen branch `production` eller bruk tagger dersom du vil styre nøyaktig hvilket commit Render bygger.

---

## 1. Koble repoet mot Render

1. Klikk **New +** øverst til høyre i Render-dashboardet og velg **Connect account** hvis du ikke allerede har koblet en Git-leverandør.
2. Godkjenn tilgangen til det aktuelle repoet.
3. Verifiser at Render finner repositoriet i listen «Repositories». Du skal nå kunne opprette både webtjenester og statiske sider direkte fra repoet.

---

## 2. Backend – Express API (Web Service)

1. **Opprett tjeneste**
   - Velg **New + → Web Service** og plukk repoet/branchen du vil bygge fra.
   - Sett **Region** til *EU (Frankfurt)* for best ytelse mot Norge.

2. **Bygg- og startkommandoer**
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - Runtime blir automatisk Node 18+ (definert i `package.json`).

3. **Miljøvariabler**
   - Klikk fanen **Environment** → **Environment Variables** og legg inn verdiene fra tabellen under. Vurder å bruke en *Environment Group* hvis flere tjenester skal dele variablene.

   | Nøkkel | Anbefalt verdi | Kommentar |
   | --- | --- | --- |
   | `NODE_ENV` | `production` | Sikrer riktige Express-optimiseringer |
   | `PORT` | *(lar Render styre)* | Trenger ikke settes eksplisitt, men ikke hardkod port i koden |
   | `CORS_ORIGIN` | `https://<frontend>.onrender.com` | Legg til flere domener separert med komma |
   | `API_ACCESS_KEY` | *(valgfri hemmelig verdi)* | Påkrevd dersom du vil at klienter må sende `x-api-key` |
   | `MOCK_EXTERNAL_APIS` | `false` i prod | Sett `true` midlertidig for demo/testing |
   | `WEATHER_CACHE_TTL_MS` | `3600000` | 1 time cache på værdata |
   | `BRREG_API_URL` | `https://data.brreg.no/enhetsregisteret/api` | Kan overstyres ved behov |
   | `KARTVERKET_ADDRESS_API` | `https://ws.geonorge.no/adresser/v1` | |
   | `KARTVERKET_WMS_URL` | `https://wms.geonorge.no/skwms1/wms.nib` | |
   | `KARTVERKET_ELEVATION_API` | `https://ws.geonorge.no/hoydedata/v1` | |
   | `MOCK_SATELLITE_IMAGE_URL` | *(valgfritt)* | URL til fallback-bilde i mock-modus |

4. **Opprett tjenesten**
   - Klikk **Create Web Service**. Første bygg tar noen minutter. Render eksponerer tjenesten på en adresse som `https://<app-name>.onrender.com`.
   - Legg inn `/health` under **Settings → Health Check Path** slik at Render kan gjenstarte podden ved feil.

5. **Verifiser**
   - Etter bygg skal **Events-loggen** vise `Service live`.
   - Åpne `https://<app-name>.onrender.com/api/health` for å bekrefte respons.
   - Test et beskyttet endepunkt med curl eller Postman dersom du har aktivert `API_ACCESS_KEY`.

---

## 3. Frontend – React-klient (Static Site)

1. **Opprett tjeneste**
   - Klikk **New + → Static Site** og velg samme repo/branch.
   - Sett **Root Directory** til `frontend`.

2. **Byggoppsett**
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `build`

3. **Miljøvariabler**
   - Under **Environment Variables** legger du til:

   | Nøkkel | Verdi |
   | --- | --- |
   | `REACT_APP_API_URL` | URL-en til backend + `/api`, f.eks. `https://solar-assessment-api.onrender.com/api` |
   | `REACT_APP_ENVIRONMENT` | `production` |
   | `REACT_APP_API_KEY` | Samme verdi som `API_ACCESS_KEY` hvis backend krever nøkkel |

4. **Deploy og test**
   - Klikk **Create Static Site**. Når bygging er ferdig, vises en adresse som `https://<frontend>.onrender.com`.
   - Åpne siden og gjennomfør en full analyse for å bekrefte kommunikasjon med API-et.
   - Dersom du trenger å oppdatere miljøvariabler, trykk **Manual Deploy → Clear build cache & deploy** etter endringene.

---

## 4. Produksjonssetting og drift

1. **Sett opp egendomenenavn**
   - Gå til **Settings → Custom Domains** på både frontend og backend.
   - Legg til domenet (f.eks. `app.dittdomene.no`), opprett CNAME/A-poster hos domeneleverandøren, og vent på at Render utsteder gratis SSL.

2. **Tving HTTPS og sikkerhetsheadere**
   - HTTPS er aktivert automatisk, men dobbeltsjekk at eventuelle proxier/Cloudflare også krever HTTPS.
   - Bekreft at `helmet` i backend er aktivt (automatisk i dette prosjektet).

3. **Observabilitet**
   - Aktiver varsler via **Settings → Notifications** (Slack, e-post eller webhooks) for deploy-feil.
   - Bruk Render Metrics for å følge med på CPU/RAM. Øk instans-størrelse ved behov.

4. **Skaleringsstrategi**
   - Standard er én instans. Sett **Autoscale** til `Auto` eller legg inn flere manuelle instanser hvis du forventer høy trafikk.
   - Tidsstyrt skalering (Cron Jobs) kan brukes for å kjøre nattlige batch-jobber hvis det blir aktuelt.

5. **Backup av konfigurasjon**
   - Eksporter miljøvariabler gjennom Render CLI (`render envgroup export`) eller behold en sikker kopi i secrets manager.
   - Lag en intern sjekkliste for hvem som har tilgang til Render- og DNS-kontoen.

---

## 5. Kontinuerlig deploy og kvalitetskontroll

1. **Automatiske deploys**
   - Render bygger på hver push til valgt branch. Deaktiver automatisk deploy i **Settings** hvis du heller vil utløse manuelt.

2. **Preview Environments**
   - Aktiver i backend/frontend-tjenesten for å få midlertidige URL-er per pull request. Husk å definere eventuelle ekstra miljøvariabler for preprod.

3. **Testpipeline**
   - Konfigurer GitHub Actions eller lignende for å kjøre `npm test` i både `frontend/` og `backend/` før du merger til produksjonsbranch.

4. **Endringsrutine**
   - Oppdater `.env.example` og dokumentasjonen når nye variabler introduseres.
   - Rotér hemmeligheter jevnlig (Render → **Environment Variables → Edit** → **Save & Deploy**).

---

## 6. Produksjonssjekkliste

- [ ] Backend-URL svarer på `/api/health` uten feil.
- [ ] Frontend viser riktig data fra produksjons-API.
- [ ] `CORS_ORIGIN` inkluderer både Render-domenet og eventuelle egendomenenavn.
- [ ] `MOCK_EXTERNAL_APIS` er satt til `false`.
- [ ] API-nøkkel er konfigurert i både backend og frontend (dersom aktivert).
- [ ] HTTPS er aktivt for alle domener.
- [ ] Miljøvariabler er sikkerhetskopiert og dokumentert.

Når alle punktene er huket av er applikasjonen klar for produksjon med stabil drift på Render.
