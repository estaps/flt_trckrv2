-- Expenses: notes, and the exchange rate behind amount_home
ALTER TABLE "expenses" ADD COLUMN     "fx_rate" DECIMAL(18,8),
ADD COLUMN     "fx_source" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Amounts already in the home currency were copied as-is
UPDATE "expenses" SET "fx_rate" = 1, "fx_source" = 'same' WHERE "amount_home" IS NOT NULL;

-- Ticket and receipt photos kept with a trip
CREATE TABLE "trip_photos" (
    "id" UUID NOT NULL,
    "trip_id" UUID,
    "flight_id" UUID,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'ticket',
    "caption" TEXT,
    "filename" TEXT,
    "mime_type" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "thumbnail_path" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "document_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_photos_pkey" PRIMARY KEY ("id")
);

-- Cached daily exchange rates
CREATE TABLE "fx_rates" (
    "day" DATE NOT NULL,
    "base" CHAR(3) NOT NULL,
    "quote" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("day","base","quote")
);

-- CreateIndex
CREATE INDEX "trip_photos_trip_id_idx" ON "trip_photos"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_photos_trip_id_sha256_key" ON "trip_photos"("trip_id", "sha256");

-- AddForeignKey
ALTER TABLE "trip_photos" ADD CONSTRAINT "trip_photos_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_photos" ADD CONSTRAINT "trip_photos_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flights"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_photos" ADD CONSTRAINT "trip_photos_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

