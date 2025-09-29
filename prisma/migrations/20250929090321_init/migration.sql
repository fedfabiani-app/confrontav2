-- CreateTable
CREATE TABLE "public"."users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "last_signed_in_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."zodiac_signs" (
    "id" SERIAL NOT NULL,
    "name_italian" TEXT NOT NULL,
    "name_english" TEXT NOT NULL,
    "date_range" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zodiac_signs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sources" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "logo_url" TEXT,
    "base_url" TEXT NOT NULL,
    "url_pattern" TEXT NOT NULL,
    "reliability_score" DECIMAL(3,2) NOT NULL DEFAULT 3.0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."horoscope_data" (
    "id" SERIAL NOT NULL,
    "source_id" INTEGER NOT NULL,
    "zodiac_sign_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "original_text" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "relazioni_rating" SMALLINT NOT NULL,
    "lavoro_rating" SMALLINT NOT NULL,
    "salute_rating" SMALLINT NOT NULL,
    "tone_analysis" TEXT NOT NULL,
    "original_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "horoscope_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "zodiac_signs_name_english_key" ON "public"."zodiac_signs"("name_english");

-- CreateIndex
CREATE UNIQUE INDEX "sources_domain_key" ON "public"."sources"("domain");

-- CreateIndex
CREATE INDEX "horoscope_data_date_idx" ON "public"."horoscope_data"("date");

-- CreateIndex
CREATE UNIQUE INDEX "horoscope_data_source_id_zodiac_sign_id_date_key" ON "public"."horoscope_data"("source_id", "zodiac_sign_id", "date");

-- AddForeignKey
ALTER TABLE "public"."horoscope_data" ADD CONSTRAINT "horoscope_data_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."horoscope_data" ADD CONSTRAINT "horoscope_data_zodiac_sign_id_fkey" FOREIGN KEY ("zodiac_sign_id") REFERENCES "public"."zodiac_signs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
