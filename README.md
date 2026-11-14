# Flight Tracker

A self-hosted web app for trips, the flights in each trip, travel expenses and photos of tickets and receipts. Flights get in by parsing confirmation emails and receipts; price tracking comes later.

Design: see the project design doc ("Flight tracker: getting flights and receipts in").

## What works today

- Postgres schema for documents, extractions, trips, bookings, flights, flight changes, expenses, attachments and airports
- REST API: `/api/health`, `/api/trips`, `/api/trips/:id`, `/api/flights`, `/api/flights/:id`
- Web pages to create trips and add flights
- Upload page (PDF, .eml, photos, pasted text) and a review inbox where parsed documents are confirmed into trips
- Delta templates for the itinerary hold, eTicket receipt and cancellation emails (printed to PDF) and the delta.com receipt PDF; anything else goes to the configured LLM
- Bookings, ticket numbers, airfare expenses and Delta eCredits (issued, applied, remaining) tracked from those documents
- Email import: a worker container watches one mailbox over IMAP and sends every new email into the review inbox
- `POST /api/documents` (multipart `file`) to ingest from scripts, and `POST /api/documents/:id/confirm` with `{"tripId"}` or `{"newTripName"}`
- A swappable LLM client (`src/lib/llm`) for OpenAI-compatible servers and Anthropic, configured by environment variables
- Docker image that backs up the app's schema and runs migrations on startup

## Run with a throwaway Postgres (testing)

```sh
docker compose -f docker-compose.yml -f docker-compose.test.yml up --build
```

Open http://localhost:3000. The test stack starts its own `postgres:16` with a named volume.

## Run against an existing Postgres

1. Copy `.env.example` to `.env` and set `DATABASE_URL`. Tables are created in the schema named by `?schema=` (default `flighttracker`), so an existing server can be shared.
2. `docker compose up -d --build`

Uploaded files and backups live in `./data`, mounted at `/data`.

## Email import

The `worker` service watches the mailbox in the `IMAP_*` settings. It remembers the last message it read, picks up new mail within seconds (IMAP IDLE, with a `IMAP_POLL_SECONDS` fallback), reconnects on its own, and skips emails it has already imported. With no `IMAP_*` settings it stays idle.

For a Proton mailbox, add Proton Mail Bridge (paid Proton plan required):

```sh
docker compose -f docker-compose.yml -f docker-compose.proton.yml run --rm protonmail-bridge init
# in the Bridge shell: login, then info (shows the IMAP username and password), then exit
# put that username and password in .env as IMAP_USER and IMAP_PASSWORD
docker compose -f docker-compose.yml -f docker-compose.proton.yml up -d
```

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
| `IMAP_HOST`, `IMAP_PORT` | none, `993` | Mailbox server for email import |
| `IMAP_SECURE` | `true` | `true` for TLS from the start; `false` for STARTTLS (Proton Bridge) |
| `IMAP_TLS_INSECURE` | `false` | Accept a self-signed certificate, as Bridge uses; only on your own network |
| `IMAP_USER`, `IMAP_PASSWORD` | none | Mailbox login |
| `IMAP_MAILBOX` | `INBOX` | Folder to watch |
| `IMAP_POLL_SECONDS` | `300` | Fallback check interval |

## Airport data

`prisma/seed/airports.json` holds IATA codes, names and time zones from [mwgg/Airports](https://github.com/mwgg/Airports) (MIT). It is used to turn printed city labels such as `WASHINGTON-REAGAN` into codes and local times into UTC.

## Development

```sh
npm install
cp .env.example .env   # point DATABASE_URL at a local Postgres; pdftotext (poppler) must be installed
npm run db:dev         # apply migrations
npm run dev
npm run worker         # email import, using IMAP_* from .env
npm test
```
