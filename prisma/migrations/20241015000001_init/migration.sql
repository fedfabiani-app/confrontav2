-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `last_signed_in_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `zodiac_signs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name_italian` VARCHAR(191) NOT NULL,
    `name_english` VARCHAR(191) NOT NULL,
    `date_range` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `zodiac_signs_name_english_key`(`name_english`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sources` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `logo_url` VARCHAR(191) NULL,
    `base_url` VARCHAR(191) NOT NULL,
    `url_pattern` VARCHAR(191) NOT NULL,
    `reliability_score` DECIMAL(3, 2) NOT NULL DEFAULT 3.0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sources_domain_key`(`domain`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `horoscope_data` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source_id` INTEGER NOT NULL,
    `zodiac_sign_id` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `original_text` LONGTEXT NOT NULL,
    `summary` LONGTEXT NOT NULL,
    `relazioni_rating` TINYINT NOT NULL,
    `lavoro_rating` TINYINT NOT NULL,
    `salute_rating` TINYINT NOT NULL,
    `tone_analysis` VARCHAR(191) NOT NULL,
    `original_url` LONGTEXT NOT NULL,
    `scraped_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `horoscope_data_date_idx`(`date`),
    UNIQUE INDEX `horoscope_data_source_id_zodiac_sign_id_date_key`(`source_id`, `zodiac_sign_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `horoscope_data` ADD CONSTRAINT `horoscope_data_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `horoscope_data` ADD CONSTRAINT `horoscope_data_zodiac_sign_id_fkey` FOREIGN KEY (`zodiac_sign_id`) REFERENCES `zodiac_signs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
