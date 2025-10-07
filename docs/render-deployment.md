# Deploy til Render.com

Denne veiledningen viser hvordan du setter opp både backend (Express) og frontend (React) på Render.com ved hjelp av dette repositoriet.

## Forutsetninger
- En Render-konto
- Repoet tilgjengelig på GitHub, GitLab eller Bitbucket
- Konfigurerte miljøvariabler (se `.env.example`-filene)

---

## 1. Backend – Express API

1. **Opprett tjeneste**
   - Logg inn på Render og velg **New +** → **Web Service**.
   - Velg repositoriet ditt og branch `main`/`work` (eller den du ønsker å deploye).

2. **Grunninnstillinger**
   - **Name:** f.eks. `solar-assessment-api`
   - **Region:** EU (Frankfurt) for lavere latency i Norge.
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

3. **Miljøvariabler**
   Legg inn følgende nøkler under **Environment** → **Environment Variables**:
   
   | Nøkkel | Anbefalt verdi | Beskrivelse |
   | --- | --- | --- |
   | `NODE_ENV` | `production` | Setter produksjonsmodus |
   | `PORT` | `10000` (Render allokerer port automatisk) | Render overstyrer automatisk, men setter en default |
   | `CORS_ORIGIN` | `https://<frontend-app>.onrender.com` | Tillatt opprinnelse (legg til flere separert med komma) |
   | `API_ACCESS_KEY` | *(valgfri hemmelig nøkkel)* | Påkrevd for å låse API-et |
   | `MOCK_EXTERNAL_APIS` | `false` (evt. `true` for demo) | Om API-et skal bruke mock-data hvis eksterne tjenester feiler |
   | `WEATHER_CACHE_TTL_MS` | `3600000` | Cache-lengde for værdata |
   | `BRREG_API_URL` | `https://data.brreg.no/enhetsregisteret/api` | Kan endres ved behov |
   | `KARTVERKET_ADDRESS_API` | `https://ws.geonorge.no/adresser/v1` |  |
   | `KARTVERKET_WMS_URL` | `https://wms.geonorge.no/skwms1/wms.nib` |  |
   | `KARTVERKET_ELEVATION_API` | `https://ws.geonorge.no/hoydedata/v1` |  |
   | `MOCK_SATELLITE_IMAGE_URL` | *(valgfri URL)* | Bruk statisk bilde i mock-modus |

   > Tips: Opprett en *Environment Group* i Render dersom du ønsker å dele variabler mellom flere tjenester.

4. **Deploy**
   - Klikk **Create Web Service**. Render bygger containeren og starter tjenesten.
   - Notér deg URL-en, f.eks. `https://solar-assessment-api.onrender.com`. Backend-endepunktene finnes under `/api` (eks. `/api/health`).

5. **Helse-sjekk (valgfritt)**
   - Under **Settings** → **Health Check Path** kan du sette `/health` for automatisk overvåkning.

---

## 2. Frontend – React-klient

Frontend kan deployes som en **Static Site**.

1. **Opprett tjeneste**
   - Velg **New +** → **Static Site**.
   - Velg samme repo og branch som over.

2. **Grunninnstillinger**
   - **Name:** f.eks. `solar-assessment-frontend`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `build`

3. **Miljøvariabler**
   Legg inn følgende (under **Environment Variables**):
   
   | Nøkkel | Verdi |
   | --- | --- |
| `REACT_APP_API_URL` | `https://solar-assessment-api.onrender.com/api` (erstatt med faktisk backend-URL) |
| `REACT_APP_ENVIRONMENT` | `production` |
| `REACT_APP_API_KEY` | *(valgfritt)* Setter automatisk `x-api-key`-header hvis backend krever API-nøkkel |

4. **Deploy**
   - Klikk **Create Static Site**. Render bygger statiske filer og publiserer på en URL som `https://solar-assessment-frontend.onrender.com`.

5. **Valider**
   - Åpne frontend-URL-en. Start en vurdering for å bekrefte at API-kallet mot backend fungerer.
- Dersom backend krever `API_ACCESS_KEY`, sett samme verdi i `REACT_APP_API_KEY` før bygging.

---

## 3. Kontinuerlig deploy
- Render trigger automatisk en ny deploy når du pusher til valgt branch.
- Bruk *Preview Environments* for å teste PR-er før de merges.

## 4. Feilsøking
- **Build feiler:** sjekk loggene i Render dashboard → *Builds*.
- **API svarer ikke:** kontroller at backend kjører, at `PORT` ikke er hardkodet, og at `CORS_ORIGIN` matcher frontend-URL.
- **Manglende data:** sett `MOCK_EXTERNAL_APIS=true` midlertidig for å isolere om problemet ligger i eksterne tjenester.

Med disse stegene er både frontend og backend tilgjengelig på Render.com med kontinuerlig deploy fra Git.
