#!/usr/bin/env bash
# Sets up Flight Tracker on a Docker host that already runs Postgres.
#
#   ./scripts/setup.sh
#
# It asks where your Postgres server is, checks that the app's containers can
# reach it, optionally creates the app's role and database, writes .env (and
# docker-compose.local.yml when the database lives on another Docker network),
# then builds and starts the stack and waits for it to be healthy.
#
# Safe to run again: answers already in .env are offered as the defaults, and
# the previous .env is copied to .env.bak-<time> before it is rewritten.
#
# Every question can be answered ahead of time with an environment variable
# (shown in [brackets] in the prompts' source below), and --yes accepts every
# default without asking, for a scripted install:
#   FT_DB_HOST=db.lan FT_DB_PASSWORD=... ./scripts/setup.sh --yes
#
# Options: --yes (no questions), --no-start (only write .env), --no-build (use an
# existing flight-tracker:latest image instead of building it).
#
# Needs: docker with the compose plugin, and openssl or /dev/urandom.
# psql is not needed on the host; a throwaway postgres:16 container runs it.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)
ENV_FILE="$ROOT/.env"
LOCAL_COMPOSE="$ROOT/docker-compose.local.yml"
PSQL_IMAGE=${FT_PSQL_IMAGE:-postgres:16}

ASSUME_YES=false
SKIP_START=false
BUILD=--build
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=true ;;
    --no-start) SKIP_START=true ;;
    --no-build) BUILD="" ;;
    -h|--help) sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$*" >&2; }
die() { printf '\033[31mError: %s\033[0m\n' "$*" >&2; exit 1; }

# --- helpers -----------------------------------------------------------------

# Current value of KEY in .env, or empty.
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  local v
  v=$(sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1)
  # Values with special characters are written single-quoted (see set_kv).
  if [[ "$v" == \'*\' ]]; then v=${v:1:${#v}-2}; fi
  printf '%s' "$v"
}

# ask VAR "Question" default [secret]
# Uses $VAR if it is already set in the environment; otherwise asks, offering
# the default (Enter keeps it). With --yes, takes the default without asking.
ask() {
  local var=$1 question=$2 default=${3-} secret=${4-} answer
  if [ -n "${!var+x}" ]; then return 0; fi
  if $ASSUME_YES || [ ! -t 0 ]; then
    printf -v "$var" '%s' "$default"
    return 0
  fi
  if [ "$secret" = secret ]; then
    local shown=""
    [ -n "$default" ] && shown=" [keep current]"
    read -r -s -p "  $question$shown: " answer; echo
  else
    read -r -p "  $question${default:+ [$default]}: " answer
  fi
  printf -v "$var" '%s' "${answer:-$default}"
}

# ask_yn VAR "Question" y|n
ask_yn() {
  local var=$1
  ask "$@"
  case "${!var}" in
    y|Y|yes|YES|true) printf -v "$var" '%s' y ;;
    *) printf -v "$var" '%s' n ;;
  esac
}

random_hex() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1"
  else head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}

# Percent-encodes a value for use inside a postgresql:// URL.
urlencode() {
  local s=$1 out="" c i
  for ((i = 0; i < ${#s}; i++)); do
    c=${s:i:1}
    case "$c" in
      [a-zA-Z0-9.~_-]) out+=$c ;;
      *) printf -v c '%%%02X' "'$c"; out+=$c ;;
    esac
  done
  printf '%s' "$out"
}

# SQL string literal.
sql_lit() { printf "'%s'" "${1//\'/\'\'}"; }
# SQL identifier.
sql_ident() { printf '"%s"' "${1//\"/\"\"}"; }

# Runs psql in a throwaway container attached the same way the app will be, so a
# successful check here means the app can connect too.
#   psql_as USER PASSWORD DBNAME [psql args...]
psql_as() {
  local user=$1 pass=$2 db=$3; shift 3
  local net_args=(--add-host host.docker.internal:host-gateway)
  [ -n "$DB_NETWORK" ] && net_args+=(--network "$DB_NETWORK")
  docker run --rm -i "${net_args[@]}" \
    -e PGPASSWORD="$pass" -e PGCONNECT_TIMEOUT=8 \
    "$PSQL_IMAGE" psql -X -q -v ON_ERROR_STOP=1 \
    -h "$DB_HOST_APP" -p "$DB_PORT" -U "$user" -d "$db" "$@"
}

# Writes KEY=VALUE into the new .env, replacing an existing line or appending.
# Values with anything beyond plain URL characters are single-quoted, so compose
# reads them literally (no $ interpolation, no # comments).
set_kv() {
  local key=$1 value=$2 tmp
  if [[ ! "$value" =~ ^[A-Za-z0-9_./:@%?=,+-]*$ ]]; then
    [[ "$value" == *\'* ]] && die "the value for $key contains a single quote, which .env cannot hold; choose another."
    value="'$value'"
  fi
  tmp=$(mktemp)
  # Passed through the environment: awk -v would interpret backslashes.
  K=$key V=$value awk '
    BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"]; done = 0 }
    $0 ~ "^" k "=" { if (!done) print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$NEW_ENV" > "$tmp"
  mv "$tmp" "$NEW_ENV"
}

# --- checks ------------------------------------------------------------------

bold "Flight Tracker setup"
command -v docker >/dev/null 2>&1 || die "docker is not installed."
docker info >/dev/null 2>&1 || die "cannot talk to the Docker daemon (is it running, and may this user use it?)."
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is missing."
[ -f "$ROOT/.env.example" ] || die "run this from a checkout of the repository."
[ -f "$ENV_FILE" ] && info "Found an existing .env; its values are the defaults."

# Defaults from an existing .env, parsed from DATABASE_URL when present.
cur_url=$(env_get DATABASE_URL)
cur_user="" cur_pass="" cur_host="" cur_port="" cur_db="" cur_schema=""
if [[ "$cur_url" =~ ^postgres(ql)?://([^:@/]+)(:([^@]*))?@([^:/?]+)(:([0-9]+))?/([^?]+)(\?(.*))?$ ]]; then
  cur_user=${BASH_REMATCH[2]} cur_pass=${BASH_REMATCH[4]} cur_host=${BASH_REMATCH[5]}
  cur_port=${BASH_REMATCH[7]} cur_db=${BASH_REMATCH[8]}
  cur_schema=$(sed -n 's/.*\(^\|&\)schema=\([^&]*\).*/\2/p' <<<"${BASH_REMATCH[10]}")
  # Percent-decode the password read back from the URL.
  cur_pass=$(printf '%b' "${cur_pass//%/\\x}")
  [ "$cur_host" = host.docker.internal ] && cur_host=localhost
fi
cur_network=""
if [ -f "$LOCAL_COMPOSE" ]; then
  cur_network=$(sed -n 's/^    name: //p' "$LOCAL_COMPOSE" | head -n 1)
fi

# --- database ----------------------------------------------------------------

echo
bold "1. Postgres"
info "Where the app's database lives. Use 'localhost' if Postgres runs on this"
info "Docker host itself, or a hostname/IP on your network."
ask FT_DB_HOST "Postgres host" "${cur_host:-localhost}"
ask FT_DB_PORT "Port" "${cur_port:-5432}"
info "If Postgres runs in a container on this host, the app can join its Docker"
info "network and reach it by container name. Leave empty to connect by host/IP."
ask FT_DB_NETWORK "Docker network to join (optional)" "$cur_network"
DB_PORT=$FT_DB_PORT
DB_NETWORK=$FT_DB_NETWORK
if [ -n "$DB_NETWORK" ] && ! docker network inspect "$DB_NETWORK" >/dev/null 2>&1; then
  echo "  Networks on this host:"; docker network ls --format '    {{.Name}}' >&2
  die "Docker network '$DB_NETWORK' does not exist."
fi
case "$FT_DB_HOST" in
  # Inside a container, localhost is the container itself; the host is host.docker.internal.
  localhost|127.0.0.1|::1) DB_HOST_APP=host.docker.internal ;;
  *) DB_HOST_APP=$FT_DB_HOST ;;
esac

ask FT_DB_NAME "Database name" "${cur_db:-flighttracker}"
ask FT_DB_USER "App's database user" "${cur_user:-flighttracker}"
ask FT_DB_SCHEMA "Schema for the app's tables" "${cur_schema:-flighttracker}"
ask_yn FT_DB_CREATE "Create this user and database now with an admin login? (y/n)" "$([ -n "$cur_url" ] && echo n || echo y)"

if [ "$FT_DB_CREATE" = y ]; then
  ask FT_DB_PASSWORD "Password for $FT_DB_USER (empty = generate one)" "$cur_pass" secret
  [ -n "$FT_DB_PASSWORD" ] || FT_DB_PASSWORD=$(random_hex 18)
  ask FT_DB_ADMIN_USER "Admin user" "postgres"
  ask FT_DB_ADMIN_PASSWORD "Password for $FT_DB_ADMIN_USER" "" secret
  [ -n "$FT_DB_ADMIN_PASSWORD" ] || die "the admin password is needed to create the user and database."
  ask FT_DB_ADMIN_DB "Database the admin connects to" "postgres"

  info "Connecting as $FT_DB_ADMIN_USER to $DB_HOST_APP:$DB_PORT ..."
  psql_as "$FT_DB_ADMIN_USER" "$FT_DB_ADMIN_PASSWORD" "$FT_DB_ADMIN_DB" -c "select 1" >/dev/null \
    || die "could not connect as $FT_DB_ADMIN_USER. Check the host, port, password, and that pg_hba.conf allows connections from Docker networks."

  role_exists=$(psql_as "$FT_DB_ADMIN_USER" "$FT_DB_ADMIN_PASSWORD" "$FT_DB_ADMIN_DB" -tA \
    -c "select 1 from pg_roles where rolname = $(sql_lit "$FT_DB_USER")")
  if [ "$role_exists" = 1 ]; then
    info "User $FT_DB_USER exists; setting its password."
    psql_as "$FT_DB_ADMIN_USER" "$FT_DB_ADMIN_PASSWORD" "$FT_DB_ADMIN_DB" \
      -c "alter role $(sql_ident "$FT_DB_USER") with login password $(sql_lit "$FT_DB_PASSWORD")" >/dev/null
  else
    info "Creating user $FT_DB_USER."
    psql_as "$FT_DB_ADMIN_USER" "$FT_DB_ADMIN_PASSWORD" "$FT_DB_ADMIN_DB" \
      -c "create role $(sql_ident "$FT_DB_USER") with login password $(sql_lit "$FT_DB_PASSWORD")" >/dev/null
  fi
  db_exists=$(psql_as "$FT_DB_ADMIN_USER" "$FT_DB_ADMIN_PASSWORD" "$FT_DB_ADMIN_DB" -tA \
    -c "select 1 from pg_database where datname = $(sql_lit "$FT_DB_NAME")")
  if [ "$db_exists" = 1 ]; then
    info "Database $FT_DB_NAME exists; making sure $FT_DB_USER may create its schema there."
    psql_as "$FT_DB_ADMIN_USER" "$FT_DB_ADMIN_PASSWORD" "$FT_DB_ADMIN_DB" \
      -c "grant connect, create on database $(sql_ident "$FT_DB_NAME") to $(sql_ident "$FT_DB_USER")" >/dev/null
  else
    info "Creating database $FT_DB_NAME owned by $FT_DB_USER."
    psql_as "$FT_DB_ADMIN_USER" "$FT_DB_ADMIN_PASSWORD" "$FT_DB_ADMIN_DB" \
      -c "create database $(sql_ident "$FT_DB_NAME") owner $(sql_ident "$FT_DB_USER")" >/dev/null
  fi
else
  ask FT_DB_PASSWORD "Password for $FT_DB_USER" "$cur_pass" secret
fi

info "Checking that the app can log in as $FT_DB_USER ..."
server_version=$(psql_as "$FT_DB_USER" "$FT_DB_PASSWORD" "$FT_DB_NAME" -tA -c "show server_version_num") \
  || die "could not connect as $FT_DB_USER to database $FT_DB_NAME on $DB_HOST_APP:$DB_PORT."
can_create=$(psql_as "$FT_DB_USER" "$FT_DB_PASSWORD" "$FT_DB_NAME" -tA -c \
  "select case when exists (select 1 from pg_namespace where nspname = $(sql_lit "$FT_DB_SCHEMA"))
               then has_schema_privilege($(sql_lit "$FT_DB_SCHEMA"), 'CREATE')
               else has_database_privilege(current_database(), 'CREATE') end")
[ "$can_create" = t ] || die "$FT_DB_USER may not create tables in schema $FT_DB_SCHEMA of $FT_DB_NAME. Rerun and answer y to create the user, or grant CREATE on the database."
major=$((server_version / 10000))
info "Connected: Postgres $major."
# The image's pg_dump (Debian trixie, version 17) can back up servers up to 17.
if [ "$major" -gt 17 ]; then
  warn "Postgres $major is newer than the image's pg_dump 17, so the backup before each upgrade would fail and stop startup."
  warn "Setting BACKUP_BEFORE_MIGRATE=false. Back up the '$FT_DB_SCHEMA' schema yourself before upgrading."
  BACKUP_BEFORE_MIGRATE=false
else
  BACKUP_BEFORE_MIGRATE=true
fi

DATABASE_URL="postgresql://$(urlencode "$FT_DB_USER"):$(urlencode "$FT_DB_PASSWORD")@$DB_HOST_APP:$DB_PORT/$(urlencode "$FT_DB_NAME")?schema=$(urlencode "$FT_DB_SCHEMA")"

# --- LLM ---------------------------------------------------------------------

echo
bold "2. LLM for reading emails, receipts and photos"
info "provider 'openai' covers any OpenAI-compatible server: Ollama, vLLM, llama.cpp,"
info "LM Studio, OpenRouter, OpenAI. Use 'anthropic' for Claude."
ask FT_LLM_PROVIDER "Provider (openai/anthropic)" "$(env_get LLM_PROVIDER || true)"
[ -n "$FT_LLM_PROVIDER" ] || FT_LLM_PROVIDER=openai
default_base=$(env_get LLM_BASE_URL)
[ "$FT_LLM_PROVIDER" = anthropic ] && [ -z "$default_base" ] && default_base=https://api.anthropic.com
[ -z "$default_base" ] && default_base=http://host.docker.internal:11434/v1
ask FT_LLM_BASE_URL "Base URL" "$default_base"
ask FT_LLM_MODEL "Model" "$(env_get LLM_MODEL)"
ask FT_LLM_VISION_MODEL "Model for images (empty = same)" "$(env_get LLM_VISION_MODEL)"
ask FT_LLM_API_KEY "API key (empty if none)" "$(env_get LLM_API_KEY)" secret

# --- mail --------------------------------------------------------------------

echo
bold "3. Email import"
cur_mail=none
[ -n "$(env_get IMAP_HOST)" ] && cur_mail=imap
grep -q 'docker-compose.proton.yml' <<<"$(env_get COMPOSE_FILE)" && cur_mail=proton
ask FT_MAIL "Mailbox: none, imap (any IMAP server) or proton (Proton Mail Bridge)" "$cur_mail"
case "$FT_MAIL" in
  imap)
    ask FT_IMAP_HOST "IMAP host" "$(env_get IMAP_HOST)"
    ask FT_IMAP_PORT "IMAP port" "$(env_get IMAP_PORT | grep . || echo 993)"
    ask FT_IMAP_SECURE "TLS from the start? (true; false = STARTTLS)" "$(env_get IMAP_SECURE | grep . || echo true)"
    ask FT_IMAP_USER "IMAP user" "$(env_get IMAP_USER)"
    ask FT_IMAP_PASSWORD "IMAP password" "$(env_get IMAP_PASSWORD)" secret
    ;;
  proton)
    ask FT_IMAP_USER "Bridge IMAP user (empty = fill in after 'init', see README)" "$(env_get IMAP_USER)"
    ask FT_IMAP_PASSWORD "Bridge IMAP password" "$(env_get IMAP_PASSWORD)" secret
    ;;
  none) ;;
  *) die "mailbox must be none, imap or proton." ;;
esac

# --- price tracking ----------------------------------------------------------

echo
bold "4. Price tracking (flight-finder sidecar)"
cur_prices=n
grep -q prices <<<"$(env_get COMPOSE_PROFILES)" && cur_prices=y
ask_yn FT_PRICES "Run the flight-finder sidecar? (y/n)" "$cur_prices"
FF_DATABASE_URL=$(env_get FLIGHT_FINDER_DATABASE_URL)
if [ "$FT_PRICES" = y ] && [ -z "$FF_DATABASE_URL" ]; then
  info "flight-finder needs its own database (it runs its own migrations)."
  if [ "$FT_DB_CREATE" = y ]; then
    ask_yn FT_FF_CREATE "Create database flight_finder and user flightfinder with the admin login? (y/n)" y
  else
    FT_FF_CREATE=n
  fi
  if [ "$FT_FF_CREATE" = y ]; then
    ff_pass=$(random_hex 18)
    if [ "$(psql_as "$FT_DB_ADMIN_USER" "$FT_DB_ADMIN_PASSWORD" "$FT_DB_ADMIN_DB" -tA -c "select 1 from pg_roles where rolname = 'flightfinder'")" = 1 ]; then
      psql_as "$FT_DB_ADMIN_USER" "$FT_DB_ADMIN_PASSWORD" "$FT_DB_ADMIN_DB" -c "alter role flightfinder with login password $(sql_lit "$ff_pass")" >/dev/null
    else
      psql_as "$FT_DB_ADMIN_USER" "$FT_DB_ADMIN_PASSWORD" "$FT_DB_ADMIN_DB" -c "create role flightfinder with login password $(sql_lit "$ff_pass")" >/dev/null
    fi
    if [ "$(psql_as "$FT_DB_ADMIN_USER" "$FT_DB_ADMIN_PASSWORD" "$FT_DB_ADMIN_DB" -tA -c "select 1 from pg_database where datname = 'flight_finder'")" != 1 ]; then
      psql_as "$FT_DB_ADMIN_USER" "$FT_DB_ADMIN_PASSWORD" "$FT_DB_ADMIN_DB" -c "create database flight_finder owner flightfinder" >/dev/null
    fi
    FF_DATABASE_URL="postgresql://flightfinder:$ff_pass@$DB_HOST_APP:$DB_PORT/flight_finder"
    info "Created database flight_finder."
  else
    ask FT_FF_DATABASE_URL "flight-finder database URL (postgresql://user:pass@host:port/db)" ""
    FF_DATABASE_URL=$FT_FF_DATABASE_URL
    [ -n "$FF_DATABASE_URL" ] || warn "No flight-finder database: it will not start until FLIGHT_FINDER_DATABASE_URL is set in .env."
  fi
fi
ask FT_ALERT_WEBHOOK_URL "Alert webhook, such as an ntfy topic URL (optional)" "$(env_get ALERT_WEBHOOK_URL)"

# --- other -------------------------------------------------------------------

echo
bold "5. Other"
ask FT_HOME_CURRENCY "Home currency" "$(env_get HOME_CURRENCY | grep . || echo USD)"
ask FT_APP_PORT "Port to serve the web UI on" "$(env_get APP_PORT | grep . || echo 3000)"
api_token=$(env_get API_TOKEN)
if [ -z "$api_token" ]; then
  ask_yn FT_API_TOKEN "Require a token for the REST API? (y/n)" n
  [ "$FT_API_TOKEN" = y ] && api_token=$(random_hex 24)
fi

# --- write files -------------------------------------------------------------

echo
bold "Writing configuration"
NEW_ENV=$(mktemp)
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$NEW_ENV"
  backup="$ENV_FILE.bak-$(date +%Y%m%d%H%M%S)"
  cp "$ENV_FILE" "$backup"
  info "Previous .env saved as $(basename "$backup")"
else
  cp "$ROOT/.env.example" "$NEW_ENV"
fi

compose_files=docker-compose.yml
[ "$FT_MAIL" = proton ] && compose_files+=":docker-compose.proton.yml"
if [ -n "$DB_NETWORK" ]; then
  cat > "$LOCAL_COMPOSE" <<EOF
# Written by scripts/setup.sh: joins the app to the Docker network where Postgres runs.
services:
  app:
    networks: [default, dbnet]
  worker:
    networks: [default, dbnet]
  flight-finder:
    networks: [default, dbnet]
networks:
  dbnet:
    external: true
    name: $DB_NETWORK
EOF
  compose_files+=":docker-compose.local.yml"
  info "Wrote docker-compose.local.yml (joins network $DB_NETWORK)"
elif [ -f "$LOCAL_COMPOSE" ]; then
  rm "$LOCAL_COMPOSE"
fi

set_kv COMPOSE_FILE "$compose_files"
set_kv COMPOSE_PROFILES "$([ "$FT_PRICES" = y ] && echo prices || true)"
set_kv APP_PORT "$FT_APP_PORT"
set_kv DATABASE_URL "$DATABASE_URL"
set_kv BACKUP_BEFORE_MIGRATE "$BACKUP_BEFORE_MIGRATE"
set_kv HOME_CURRENCY "$FT_HOME_CURRENCY"
set_kv API_TOKEN "$api_token"
set_kv LLM_PROVIDER "$FT_LLM_PROVIDER"
set_kv LLM_BASE_URL "$FT_LLM_BASE_URL"
set_kv LLM_MODEL "$FT_LLM_MODEL"
set_kv LLM_VISION_MODEL "$FT_LLM_VISION_MODEL"
set_kv LLM_API_KEY "$FT_LLM_API_KEY"
case "$FT_MAIL" in
  imap)
    set_kv IMAP_HOST "$FT_IMAP_HOST"; set_kv IMAP_PORT "$FT_IMAP_PORT"; set_kv IMAP_SECURE "$FT_IMAP_SECURE"
    set_kv IMAP_USER "$FT_IMAP_USER"; set_kv IMAP_PASSWORD "$FT_IMAP_PASSWORD" ;;
  proton)
    # docker-compose.proton.yml sets the host, port and TLS options for the worker.
    set_kv IMAP_USER "$FT_IMAP_USER"; set_kv IMAP_PASSWORD "$FT_IMAP_PASSWORD" ;;
  none)
    set_kv IMAP_HOST "" ;;
esac
if [ "$FT_PRICES" = y ]; then
  set_kv FLIGHT_FINDER_URL "http://flight-finder:3003"
  set_kv FLIGHT_FINDER_DATABASE_URL "$FF_DATABASE_URL"
  # Read by flight-finder on its first start only, so keep values that already exist.
  for key in FLIGHT_FINDER_SESSION_SECRET FLIGHT_FINDER_CRON_SECRET; do
    [ -n "$(env_get "$key")" ] || set_kv "$key" "$(random_hex 32)"
  done
  [ -n "$(env_get FLIGHT_FINDER_TOKEN)" ] || set_kv FLIGHT_FINDER_TOKEN "ff_$(random_hex 32)"
  [ -n "$(env_get FLIGHT_FINDER_ADMIN_PASSWORD)" ] || set_kv FLIGHT_FINDER_ADMIN_PASSWORD "$(random_hex 12)"
  [ -n "$(env_get FLIGHT_FINDER_PASSWORD)" ] || set_kv FLIGHT_FINDER_PASSWORD "$(random_hex 12)"
else
  set_kv FLIGHT_FINDER_URL ""
fi
set_kv ALERT_WEBHOOK_URL "$FT_ALERT_WEBHOOK_URL"

mv "$NEW_ENV" "$ENV_FILE"
chmod 600 "$ENV_FILE"
mkdir -p "$ROOT/data/files" "$ROOT/data/backups"
info "Wrote .env (readable only by you)"

if $SKIP_START; then
  echo; bold "Done. Start it with: docker compose up -d --build"; exit 0
fi

# --- start -------------------------------------------------------------------

echo
bold "Building and starting"
docker compose up -d $BUILD
info "Waiting for the app to be healthy (migrations run on first start) ..."
for _ in $(seq 1 60); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null || echo starting)
  [ "$status" = healthy ] && break
  if [ "$status" = unhealthy ] || [ -z "$(docker compose ps -q --status running app)" ]; then
    docker compose logs --tail 40 app >&2
    die "the app did not start; its log is above."
  fi
  sleep 3
done
[ "$status" = healthy ] || { docker compose logs --tail 40 app >&2; die "the app is not healthy after 3 minutes; its log is above."; }

echo
bold "Flight Tracker is running at http://$(hostname -f 2>/dev/null || hostname):$FT_APP_PORT"
[ -n "$api_token" ] && info "API token: in .env as API_TOKEN"
if [ "$FT_PRICES" = y ]; then
  info "flight-finder UI: http://$(hostname):$(env_get FLIGHT_FINDER_PORT | grep . || echo 3003)"
  info "  sign in with FLIGHT_FINDER_ADMIN_PASSWORD from .env and set its LLM provider there."
fi
if [ "$FT_MAIL" = proton ] && [ -z "$FT_IMAP_USER" ]; then
  info "Proton: run 'docker compose run --rm protonmail-bridge init' (login, info, exit),"
  info "  then rerun this script with the IMAP user and password it shows."
fi
