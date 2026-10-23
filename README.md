# Flight Tracker

A self-hosted web app for trips, the flights in each trip, travel expenses and photos of tickets and receipts. Flights get in by parsing confirmation emails and receipts, and fares for booked flights and watched routes are tracked through a flight-finder sidecar.

Design: see the project design doc ("Flight tracker: getting flights and receipts in").

## What works today

- Postgres schema for documents, extractions, trips, bookings, flights, flight changes, expenses, attachments and airports
- REST API: `/api/health`, `/api/trips`, `/api/trips/:id`, `/api/flights`, `/api/flights/:id`
- Web pages to create trips and add flights
- Upload page (PDF, .eml, photos, pasted text) and a review inbox where parsed documents are confirmed into trips
- Delta templates for the itinerary hold, eTicket receipt and cancellation emails (printed to PDF) and the delta.com receipt PDF; anything else goes to the configured LLM
- Bookings, ticket numbers, airfare expenses and Delta eCredits (issued, applied, remaining) tracked from those documents
- `POST /api/documents` (multipart `file`) to ingest from scripts, and `POST /api/documents/:id/confirm` with `{"tripId"}` or `{"newTripName"}`
- A swappable LLM client (`src/lib/llm`) for OpenAI-compatible servers and Anthropic, configured by environment variables
- Docker image that backs up the app's schema and runs migrations on startup
- Price watches for booked flights and for routes and dates, with price history, drop alerts and an optional ntfy or webhook notification (see [Price tracking](#price-tracking))

## Run with a throwaway Postgres (testing)

```sh
docker compose -f docker-compose.yml -f docker-compose.test.yml up --build
```

Open http://localhost:3000. The test stack starts its own `postgres:16` with a named volume.

## Run against an existing Postgres

1. Copy `.env.example` to `.env` and set `DATABASE_URL`. Tables are created in the schema named by `?schema=` (default `flighttracker`), so an existing server can be shared.
2. `docker compose up -d --build`

Uploaded files and backups live in `./data`, mounted at `/data`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | required | Postgres connection, with `?schema=` |
| `HOME_CURRENCY` | `USD` | Currency for expense totals |
| `API_TOKEN` | empty | When set, the API requires `Authorization: Bearer <token>` |
| `FILES_DIR` | `/data/files` | Storage for emails and uploads |
| `BACKUP_BEFORE_MIGRATE` | `true` | `pg_dump` the schema before migrations; startup stops if the backup fails |
| `BACKUP_DIR` | `/data/backups` | Where backups go |
| `LLM_PROVIDER` | `openai` | `openai` for any OpenAI-compatible server (Ollama, vLLM, llama.cpp, LM Studio, OpenRouter), or `anthropic` |
| `LLM_BASE_URL` | none | Endpoint, for example `http://ollama:11434/v1` |
| `LLM_API_KEY` | none | Key for the endpoint, if it needs one |
| `LLM_MODEL` | none | Model for text extraction |
| `LLM_VISION_MODEL` | `LLM_MODEL` | Model for images such as boarding passes and receipts |
| `FLIGHT_FINDER_URL` | none | flight-finder sidecar, for example `http://flight-finder:3003`; empty turns price checks off |
| `FLIGHT_FINDER_TOKEN` | none | API token sent to the sidecar |
| `PRICE_SYNC_MINUTES` | `60` | How often new fares are read from the sidecar; `0` turns the timer off |
| `ALERT_WEBHOOK_URL` | none | Where price alerts are posted, such as an ntfy topic URL |
| `ALERT_WEBHOOK_FORMAT` | `ntfy` | `ntfy` (text body with a Title header) or `json` |

The `FLIGHT_FINDER_*` sidecar settings (database, passwords, check interval, image, port) are described in `.env.example`.

## Price tracking

Fares come from [flight-finder](https://github.com/affromero/flight-finder) (MIT), which runs as the `flight-finder` service in `docker-compose.yml`. It scrapes Google Flights in headless Chromium every `FLIGHT_FINDER_CHECK_HOURS` and keeps its own database. This app creates one flight-finder tracker per watch, reads the fares back every `PRICE_SYNC_MINUTES`, and keeps its own history in `price_watches`, `price_points` and `price_alerts`.

- **Prices** page: watch a booked flight (route, date and flight number come from the flight; the paid price comes from a one-flight booking, or you can type it) or any route and date, one way or round trip, optionally limited to an airline, cabin and number of stops.
- Each check records the cheapest matching fare. For a booked flight, that is the flight itself, found by flight number or departure time; when the fare site does not list it, the airline's cheapest fare that day is shown and marked.
- Alerts fire when the fare drops by an amount or percent from its last high, reaches a target price, or goes below what you paid. For Delta, the alert reminds you that changing to the same flight can return the difference as an eCredit (not on Basic Economy).
- Alerts show on the Prices page and go to `ALERT_WEBHOOK_URL` when set, for example an ntfy topic.
- API: `GET/POST /api/watches`, `GET/PATCH/DELETE /api/watches/:id`, `POST /api/watches/sync` (read new fares now). Create with `{"flightId"}` or `{"origin","destination","departDate"}` plus optional `returnDate`, `airline`, `cabin`, `maxStops`, `paidPrice`, `targetPrice`, `dropAmount`, `dropPercent` (a fraction, 0.1 = 10%).

### Setting up the sidecar

1. Create a database for it on your Postgres server, separate from the app's (flight-finder runs its own migrations): `CREATE DATABASE flight_finder;` and set `FLIGHT_FINDER_DATABASE_URL`.
2. Set `FLIGHT_FINDER_TOKEN` (`echo ff_$(openssl rand -hex 32)`), `FLIGHT_FINDER_ADMIN_PASSWORD` and `FLIGHT_FINDER_PASSWORD` in `.env` before its first start. flight-finder registers the token and passwords on first start only.
3. `docker compose up -d`, open `http://<host>:3003`, sign in, and pick an LLM provider in its settings (it uses one to read fares off the page; an OpenAI-compatible endpoint such as Ollama works).
4. Add a watch on the Prices page. The first fares arrive after the sidecar's first scrape.

If the token was not set before the sidecar's first start, create one with flight-finder's `access device` command and put it in `FLIGHT_FINDER_TOKEN`.

## Airport data

`prisma/seed/airports.json` holds IATA codes, names and time zones from [mwgg/Airports](https://github.com/mwgg/Airports) (MIT). It is used to turn printed city labels such as `WASHINGTON-REAGAN` into codes and local times into UTC.

## Development

```sh
npm install
cp .env.example .env   # point DATABASE_URL at a local Postgres; pdftotext (poppler) must be installed
npm run db:dev         # apply migrations
npm run dev
npm test
```
