# 🌟 Solar Assessment App - Solcellevurdering for Næringsbygg

En profesjonell webapplikasjon for vurdering av solcellepotensial på næringsbygg i Norge.

## 📋 Funksjoner

- ✅ Verifisering av organisasjonsnummer via Brønnøysundregisteret
- 📍 Geokoding av adresser via Kartverket
- 🛰️ Satellittbilder fra Norge i bilder (WMS)
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
cp .env.example .env
# Rediger .env med dine innstillinger
```

4. **Start applikasjonen**

Med Docker:
```bash
docker-compose up
```

Uten Docker:
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
- Backend API: http://localhost:3001

## 🏗️ Teknisk Stack

### Frontend
- React 18
- Tailwind CSS
- Axios
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

### Vercel (Frontend)
```bash
npm install -g vercel
vercel
```

### Railway/Heroku (Backend)
```bash
railway login
railway init
railway up
```

## 🧪 Testing

```bash
# Frontend tester
cd frontend
npm test

# Backend tester
cd backend
npm test

# Coverage rapport
npm run test:coverage
```

## 📝 API Dokumentasjon

### Endpoints

#### `POST /api/verify-company`
Verifiserer organisasjonsnummer mot Brønnøysundregisteret.

#### `POST /api/geocode`
Konverterer adresse til koordinater.

#### `POST /api/analyze-roof`
Analyserer takflate basert på satellittbilder.

#### `POST /api/assess`
Utfører komplett solcellevurdering.

## 🔒 Sikkerhet

- HTTPS påkrevd i produksjon
- Rate limiting på alle API-endpoints
- Input validering og sanitering
- Helmet.js for sikre HTTP headers
- CORS konfigurert for kjente domener

## 🤝 Bidra

Vi tar gjerne imot bidrag! Se [CONTRIBUTING.md](CONTRIBUTING.md) for retningslinjer.

## 📄 Lisens

Dette prosjektet er lisensiert under MIT-lisensen. Se [LICENSE](LICENSE) filen for detaljer.

## 📞 Kontakt

- Prosjekt Link: [https://github.com/ditt-brukernavn/solar-assessment-app](https://github.com/ditt-brukernavn/solar-assessment-app)
- Issues: [GitHub Issues](https://github.com/ditt-brukernavn/solar-assessment-app/issues)

## 🙏 Anerkjennelser

- [Kartverket](https://www.kartverket.no) for kart- og geodata
- [Brønnøysundregistrene](https://www.brreg.no) for bedriftsdata
- [Norge digitalt](https://www.geonorge.no) for tilgang til geodata
