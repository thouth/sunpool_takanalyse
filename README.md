# 🌟 Solar Assessment App - Solcellevurdering for Næringsbygg

En profesjonell webapplikasjon for vurdering av solcellepotensial på næringsbygg i Norge.

## 📋 Funksjoner

- ✅ Verifisering av organisasjonsnummer via Brønnøysundregisteret (med lokal fallback)
- 📍 Geokoding av adresser via Kartverket (med lokal fallback)
- 🛰️ Satellittbilder fra Norge i bilder (eller forhåndsdefinert mock-bilde)
- 📊 Analyse av takflater og solpotensial
- 🌤️ Lokale værforhold og solinnstråling
- 📈 Produksjonsestimater og økonomiske beregninger
- 📱 Responsivt design for alle enheter

## 🚀 Kom i gang

### Forutsetninger

- Node.js 18+ og npm
- Git
- Docker og Docker Compose (valgfritt)

### Installasjon

1. **Klon repositoriet**
   ```bash
   git clone https://github.com/ditt-brukernavn/solar-assessment-app.git
   cd solar-assessment-app
   ```

2. **Installer dependencies**
   ```bash
   # Frontend
   cd frontend
   npm install

   # Backend
   cd ../backend
   npm install
   ```

3. **Konfigurer miljøvariabler**
   ```bash
   # Backend
   cp backend/.env.example backend/.env

   # Frontend
   cp frontend/.env.example frontend/.env
   ```

   `MOCK_EXTERNAL_APIS=true` i backend-konfigurasjonen gjør at appen fungerer uten nettilgang til Brønnøysundregisteret og Kartverket. Sett verdien til `false` i produksjon for å bruke ekte data. Dersom du aktiverer `API_ACCESS_KEY` på backend, fyll inn den samme verdien i `REACT_APP_API_KEY` i frontend.

4. **Start applikasjonen**

   **Med Docker**
   ```bash
   docker-compose up
   ```

   **Uten Docker**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev

   # Terminal 2 - Frontend
   cd frontend
   npm start
   ```

   Applikasjonen er nå tilgjengelig på:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001/api

## 🏗️ Teknisk stack

### Frontend
- React 18
- Tailwind CSS
- Fetch API
- Lucide Icons

### Backend
- Node.js & Express
- Helmet (sikkerhet)
- Express Rate Limit
- Axios (API-integrasjoner)

### Eksterne APIer
- Brønnøysundregisteret
- Kartverket (adresser, kart, høydedata)
- Norge i bilder (ortofoto)

## 📦 Deployment

- Se [Render-oppsett](docs/render-deployment.md) for en stegvis veiledning til både frontend og backend.
- Render bygger og deployer automatisk fra GitHub-repositoriet ditt, så den tidligere GitHub Actions-workflowen for Vercel/Railway er ikke nødvendig.
- Frontend kan også deployes på Vercel/Netlify, backend kan hostes på Railway/Heroku/Docker dersom du ønsker alternativer til Render.

## 🧪 Testing

```bash
# Frontend tester
cd frontend
npm test

# Backend tester
cd backend
npm test
```

## 📝 API Dokumentasjon

Alle endepunkter prefikses med `/api`.

### `POST /api/company/verify`
Verifiserer organisasjonsnummer mot Brønnøysundregisteret. Returnerer mock-data dersom ekstern tjeneste ikke er tilgjengelig og `MOCK_EXTERNAL_APIS=true`.

### `POST /api/address/geocode`
Konverterer adresse til koordinater og kommuneinformasjon. Har samme fallback-mekanisme som over.

### `POST /api/analysis/roof`
Analyserer takflate basert på genererte/virkelige satellittbilder.

### `POST /api/analysis/location`
Returnerer lokasjonsanalyse inkludert værforhold dersom `includeWeather=true`.

### `POST /api/assessment/full`
Utfører komplett solcellevurdering (selskap, adresse, tak, vær). Settes `save=true` blir resultatet lagret i minnet.

### `GET /api/assessment/:id`
Henter tidligere lagret vurdering.

### `GET /api/assessment`
Lister lagrede vurderinger med paginering.

## 🔒 Sikkerhet

- HTTPS påkrevd i produksjon
- API-nøkkel via `API_ACCESS_KEY` (valgfritt) på alle `/api`-ruter
- Rate limiting og Helmet for HTTP headere
- Input-validering via tilpasset middleware
- CORS konfigurert via `CORS_ORIGIN`

## 🤝 Bidra

Vi tar gjerne imot bidrag! Opprett en issue eller pull request.

## 📄 Lisens

Dette prosjektet er lisensiert under MIT-lisensen.

## 📞 Kontakt

- Prosjektlink: [https://github.com/ditt-brukernavn/solar-assessment-app](https://github.com/ditt-brukernavn/solar-assessment-app)
- Issues: [GitHub Issues](https://github.com/ditt-brukernavn/solar-assessment-app/issues)

## 🙏 Anerkjennelser

- [Kartverket](https://www.kartverket.no) for kart- og geodata
- [Brønnøysundregistrene](https://www.brreg.no) for bedriftsdata
- [Norge digitalt](https://www.geonorge.no) for tilgang til geodata
