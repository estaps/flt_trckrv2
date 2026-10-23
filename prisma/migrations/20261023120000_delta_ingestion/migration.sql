-- AlterEnum
ALTER TYPE "DocumentStatus" ADD VALUE 'ignored' BEFORE 'failed';
ALTER TYPE "ExtractionMethod" ADD VALUE 'template' BEFORE 'barcode';

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('held', 'ticketed', 'cancelled');

-- CreateEnum
CREATE TYPE "ECreditStatus" AS ENUM ('active', 'used');

-- Bookings: one row per confirmation code, plus ticket number and status
DROP INDEX "bookings_confirmation_code_idx";
ALTER TABLE "bookings"
    ADD COLUMN "ticket_number" TEXT,
    ADD COLUMN "status" "BookingStatus" NOT NULL DEFAULT 'ticketed',
    ADD COLUMN "passenger_name" TEXT,
    ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "bookings_confirmation_code_key" ON "bookings"("confirmation_code");
CREATE UNIQUE INDEX "bookings_ticket_number_key" ON "bookings"("ticket_number");

-- Flights: keep the airline's local date and times; UTC becomes optional
ALTER TABLE "flights"
    ADD COLUMN "dep_date" DATE,
    ADD COLUMN "dep_time_local" VARCHAR(5),
    ADD COLUMN "arr_time_local" VARCHAR(5),
    ADD COLUMN "fare_class" VARCHAR(2),
    ALTER COLUMN "dep_time_utc" DROP NOT NULL;
UPDATE "flights" SET "dep_date" = "dep_time_utc"::date WHERE "dep_date" IS NULL;
ALTER TABLE "flights" ALTER COLUMN "dep_date" SET NOT NULL;
DROP INDEX "flights_carrier_flight_number_dep_time_utc_key";
CREATE UNIQUE INDEX "flights_carrier_flight_number_dep_date_key" ON "flights"("carrier", "flight_number", "dep_date");

-- Expenses: link to the booking they pay for
ALTER TABLE "expenses" ADD COLUMN "booking_id" UUID;
CREATE UNIQUE INDEX "expenses_booking_id_category_key" ON "expenses"("booking_id", "category");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Airports: state or province
ALTER TABLE "airports" ADD COLUMN "state" TEXT;

-- CreateTable
CREATE TABLE "ecredits" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "airline" TEXT,
    "amount" DECIMAL(12,2),
    "currency" CHAR(3),
    "expires_on" DATE,
    "status" "ECreditStatus" NOT NULL DEFAULT 'active',
    "source_ticket_number" TEXT,
    "document_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ecredits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ecredits_number_key" ON "ecredits"("number");
ALTER TABLE "ecredits" ADD CONSTRAINT "ecredits_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
