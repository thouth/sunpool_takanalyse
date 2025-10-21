# Mocking eksterne API-er

Denne guiden beskriver hvordan man kan mocke tredjeparts-tjenester når man utvikler lokalt.

## Kartverket (satellitt/wms)

### Backend

- Sett miljøvariabelen `MOCK_EXTERNAL_APIS=true` for å aktivere generelle mock-data.
- Sett `MOCK_SATELLITE_IMAGE_URL` til en data-URL (for eksempel generert fra et PNG-bilde) for å levere et statisk bilde uten å kontakte Kartverket.
  - Når variabelen er satt vil `/api/satellite-image` svare med data-URL-en direkte.
  - Både tjenestelaget (`KartverketService`) og API-ruten respekterer variabelen.
- Eksempel på `.env`-konfigurasjon:

```env
MOCK_EXTERNAL_APIS=true
MOCK_SATELLITE_IMAGE_URL=data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...
```

### Frontend

- Sett `REACT_APP_USE_MOCK_SATELLITE=true` for å hoppe over API-kallet og vise et lokalt bilde.
- Som standard leverer frontend-komponenten et innebygget (inline) PNG-plaseholderbilde slik at du slipper å håndtere binære filer i repoet.
- Ønsker du et eget bilde kan du legge det i `frontend/public/` og peke på det med `REACT_APP_MOCK_SATELLITE_ASSET` (for eksempel `mock-satellite.png`).
- Miljøvariabelen kan også peke på en ekstern URL eller en ferdig `data:`-URL dersom du ønsker å bruke en annen kilde.
- Flagget er nyttig i demoer eller når backend ikke er tilgjengelig.

### Docker Compose

For å starte begge applikasjonene i mock-modus kan du bruke følgende miljøvariabler i `docker-compose.yml` (se filen for den komplette konfigurasjonen):

```yaml
environment:
  - MOCK_EXTERNAL_APIS=true
  - MOCK_SATELLITE_IMAGE_URL=data:image/png;base64,...
```

I frontend-tjenesten kan du legge til:

```yaml
environment:
  - REACT_APP_USE_MOCK_SATELLITE=true
  - REACT_APP_MOCK_SATELLITE_ASSET=mock-satellite.png # valgfritt
```

> Husk at data-URL-er kan bli lange. Legg dem gjerne i en egen `.env`-fil som Docker Compose refererer til ved hjelp av `env_file` dersom det er mer praktisk.
