# 5. juni 2024 – Kodeoppgaver for å få solenergianalysen i drift

Denne listen bryter ned audit-funnene til konkrete implementasjonsoppgaver. Hver oppgave inneholder forslag til akseptansekriterier slik at teamet kan fordele arbeidet og verifisere fremdrift.

## Backend

### 1. Fullføre grunnleggende infrastruktur i Express-appen
- [ ] Opprett `backend/src/routes/health.js` med `GET /` som returnerer `{ status: 'ok' }` og integrer ruten i `app.js`.
- [ ] Implementer `backend/src/middleware/errorHandler.js` som fanger opp feil, logger dem og returnerer strukturert JSON (`{ success: false, error: message }`).
- [ ] Implementer `backend/src/middleware/validateRequest.js` for å validere `req.body` mot et skjema (f.eks. `Joi`) eller skrive en enkel manuell validator.
- [ ] Erstatt de tomme `auth.js` og `ratelimit.js`-filene med faktisk middleware eller fjern import/bruk i `app.js` hvis de ikke trengs.

**Akseptansekriterier**
- Backend starter uten `MODULE_NOT_FOUND` eller "middleware is not a function"-feil.
- `/health` svarer med HTTP 200 og en JSON-status.
- Ugyldige forespørsler gir 400 med forklarende feilmelding, og uventede feil gir 500 med generisk feilmelding.

### 2. Implementere API-ruter
- [ ] Fyll `backend/src/routes/api.js` med et `express.Router()` som kobler URL-er til kontrollerne:
  - `POST /company/verify` → `companyController.verifyCompany`
  - `POST /address/geocode` → `addressController.geocodeAddress`
  - `POST /analysis/roof` → `analysisController.analyzeRoof`
  - `POST /analysis/location` → `analysisController.analyzeLocation`
  - `POST /assessment/full` → `assessmentController.performAssessment`
  - `GET /assessment/:id` → `assessmentController.getAssessment`
- [ ] Legg til inputvalidering per rute (integrer med `validateRequest`).

**Akseptansekriterier**
- Alle endepunkter returnerer 200-serie svar for gyldige forespørsler.
- Minimum én integrasjonstest som treffer `/api/assessment/full` med mockede tjenester.

### 3. Ferdigstille vær- og konteksttjenester
- [ ] Implementer `backend/src/services/weatherService.js` med kall mot valgt vær-API (f.eks. MET) eller en realistisk mock.
- [ ] Utvid `assessmentService` til å bruke værdata i scoreberegningen.
- [ ] Sikre at `performAssessment` henter værdata og inkluderer dem i responsen.

**Akseptansekriterier**
- Værdata dukker opp i svaret fra `POST /api/assessment/full`.
- Skår og anbefalinger endrer seg når værresponsen manipuleres i tester.

## Frontend

### 4. Ferdigstille API-klienten
- [ ] Implementer `frontend/src/services/api.js` med en `assessmentService` som eksporterer:
  - `performFullAssessment(payload, onProgress)`
  - `verifyCompany(orgNumber)`
  - `geocodeAddress(address)`
  - `analyzeRoof(coordinates)`
  - `analyzeLocation(coordinates)`
- [ ] Bruk `fetch` eller `axios` med `REACT_APP_API_URL` og håndter feil respons.

**Akseptansekriterier**
- `SolarAssessmentApp` kan trykke på "Start vurdering" uten runtime-feil, og laster data fra backend.
- Feilmeldinger vises i UI når API-et svarer med feil.

### 5. Bildeanalyse i klienten (valgfritt dersom backend gjør alt)
- [ ] Hvis bildeanalyse skal simuleres i frontend, implementer `frontend/src/services/imageAnalysis.js` med funksjoner for å hente/analysere bilder.
- [ ] Ellers fjern ubrukt import og logikk fra frontend og la backend håndtere bildetjenester.

**Akseptansekriterier**
- Ingen tomme moduler forblir importert i React-koden.
- CI lint/build passerer uten "module not found" eller "undefined"-feil.

### 6. Frontend-beregninger og visning
- [ ] Legg til filendelse og implementer `frontend/src/utils/calculations.js` med hjelpefunksjoner for produksjon, CO₂-besparelser og lønnsomhet.
- [ ] Bruk funksjonene i `SolarAssessmentApp` for å formatere resultater.

**Akseptansekriterier**
- Resultatseksjonen viser tall basert på hjelpefunksjonene.
- Enhetstester dekker kalkulasjonslogikken.

## DevOps og kvalitet

### 7. Miljøfiler og konfig
- [ ] Gi `.env example` riktig navn (`.env.example`) i både frontend og backend og dokumenter nødvendige variabler.
- [ ] Oppdater README med eksakte oppstartskommandoer og krav.

### 8. Test- og byggoppsett
- [ ] Sett opp grunnleggende Jest/Vitest-testløp for både backend og frontend.
- [ ] Legg til GitHub Actions-workflow eller annen CI som kjører lint, test og build.

---

Når disse oppgavene er ferdigstilt, bør både API-et og React-klienten kunne kjøres lokalt med `npm run dev` (backend) og `npm start` (frontend), og levere en komplett ende-til-ende solcellevurdering.
