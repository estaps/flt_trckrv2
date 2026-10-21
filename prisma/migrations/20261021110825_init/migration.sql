-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('imap', 'upload', 'api');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('new', 'parsed', 'needs_review', 'confirmed', 'failed');

-- CreateEnum
CREATE TYPE "ExtractionMethod" AS ENUM ('barcode', 'schema_org', 'llm', 'ocr', 'manual');

-- CreateEnum
CREATE TYPE "FlightStatus" AS ENUM ('scheduled', 'changed', 'cancelled', 'flown');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('ticket', 'receipt', 'boarding_pass', 'other');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "source" "DocumentSource" NOT NULL,
    "message_id" TEXT,
    "sha256" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "subject" TEXT,
    "sender" TEXT,
    "storage_path" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'new',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extractions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "method" "ExtractionMethod" NOT NULL,
    "model" TEXT,
    "raw_json" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "trip_id" UUID,
    "confirmation_code" TEXT NOT NULL,
    "airline_or_agency" TEXT,
    "booked_at" TIMESTAMP(3),
    "total_amount" DECIMAL(12,2),
    "currency" CHAR(3),
    "document_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flights" (
    "id" UUID NOT NULL,
    "booking_id" UUID,
    "trip_id" UUID,
    "carrier" VARCHAR(3) NOT NULL,
    "flight_number" VARCHAR(8) NOT NULL,
    "dep_airport" CHAR(3) NOT NULL,
    "arr_airport" CHAR(3) NOT NULL,
    "dep_time_utc" TIMESTAMP(3) NOT NULL,
    "arr_time_utc" TIMESTAMP(3),
    "seat" TEXT,
    "cabin" TEXT,
    "status" "FlightStatus" NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_changes" (
    "id" UUID NOT NULL,
    "flight_id" UUID NOT NULL,
    "document_id" UUID,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flight_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "trip_id" UUID,
    "category" TEXT NOT NULL,
    "merchant" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amount_home" DECIMAL(12,2),
    "spent_on" DATE NOT NULL,
    "document_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'other',
    "storage_path" TEXT NOT NULL,
    "thumbnail_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airports" (
    "iata" CHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "country" CHAR(2),
    "tz" TEXT,

    CONSTRAINT "airports_pkey" PRIMARY KEY ("iata")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_message_id_key" ON "documents"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_sha256_key" ON "documents"("sha256");

-- CreateIndex
CREATE INDEX "extractions_document_id_idx" ON "extractions"("document_id");

-- CreateIndex
CREATE INDEX "bookings_confirmation_code_idx" ON "bookings"("confirmation_code");

-- CreateIndex
CREATE INDEX "flights_trip_id_idx" ON "flights"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "flights_carrier_flight_number_dep_time_utc_key" ON "flights"("carrier", "flight_number", "dep_time_utc");

-- CreateIndex
CREATE INDEX "flight_changes_flight_id_idx" ON "flight_changes"("flight_id");

-- CreateIndex
CREATE INDEX "expenses_trip_id_idx" ON "expenses"("trip_id");

-- AddForeignKey
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_changes" ADD CONSTRAINT "flight_changes_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_changes" ADD CONSTRAINT "flight_changes_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
