-- Price tracking: watched routes and flights, their price history, and drop alerts.

-- CreateEnum
CREATE TYPE "PriceWatchStatus" AS ENUM ('active', 'paused', 'expired', 'error');

-- CreateEnum
CREATE TYPE "PriceAlertKind" AS ENUM ('drop', 'target', 'below_paid');

-- CreateTable
CREATE TABLE "price_watches" (
    "id" UUID NOT NULL,
    "label" TEXT,
    "origin" CHAR(3) NOT NULL,
    "destination" CHAR(3) NOT NULL,
    "depart_date" DATE NOT NULL,
    "return_date" DATE,
    "cabin" TEXT NOT NULL DEFAULT 'economy',
    "airline" TEXT,
    "flight_number" TEXT,
    "depart_time" VARCHAR(5),
    "max_stops" INTEGER,
    "flight_id" UUID,
    "paid_price" DECIMAL(12,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "target_price" DECIMAL(12,2),
    "drop_amount" DECIMAL(12,2),
    "drop_percent" DOUBLE PRECISION,
    "drop_baseline" DECIMAL(12,2),
    "status" "PriceWatchStatus" NOT NULL DEFAULT 'active',
    "remote_query_id" TEXT,
    "remote_token" TEXT,
    "synced_through" TIMESTAMP(3),
    "last_checked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_watches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_points" (
    "id" UUID NOT NULL,
    "watch_id" UUID NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "airline" TEXT,
    "flight_number" TEXT,
    "depart_time" TEXT,
    "stops" INTEGER,
    "booking_url" TEXT,
    "matched_by" TEXT NOT NULL,
    "fare_count" INTEGER NOT NULL,

    CONSTRAINT "price_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_alerts" (
    "id" UUID NOT NULL,
    "watch_id" UUID NOT NULL,
    "kind" "PriceAlertKind" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "previous_price" DECIMAL(12,2),
    "currency" CHAR(3) NOT NULL,
    "message" TEXT NOT NULL,
    "notified_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_watches_remote_query_id_key" ON "price_watches"("remote_query_id");

-- CreateIndex
CREATE INDEX "price_watches_status_idx" ON "price_watches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "price_points_watch_id_observed_at_key" ON "price_points"("watch_id", "observed_at");

-- CreateIndex
CREATE INDEX "price_alerts_watch_id_idx" ON "price_alerts"("watch_id");

-- AddForeignKey
ALTER TABLE "price_watches" ADD CONSTRAINT "price_watches_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flights"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_points" ADD CONSTRAINT "price_points_watch_id_fkey" FOREIGN KEY ("watch_id") REFERENCES "price_watches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_watch_id_fkey" FOREIGN KEY ("watch_id") REFERENCES "price_watches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

