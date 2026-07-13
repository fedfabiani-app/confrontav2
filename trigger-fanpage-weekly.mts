#!/usr/bin/env node
/**
 * Script per lanciare lo scraper settimanale di Fanpage
 * Usage: npm run --silent trigger-fanpage-weekly
 */

import { PrismaClient } from '@prisma/client';
import { runWeeklyScraperCycle } from './server/services/weeklyScraperOrchestrator';
import { getCurrentWeekStart } from './server/utils/weekUtils';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🚀 Triggering weekly scraper for Fanpage...\n');

    // Find Fanpage source
    const fanpageSource = await prisma.weeklySource.findFirst({
      where: {
        domain: {
          contains: 'fanpage'
        }
      }
    });

    if (!fanpageSource) {
      console.error('❌ Fanpage weekly source not found in database');
      console.log('Available sources:');
      const sources = await prisma.weeklySource.findMany({
        select: { id: true, name: true, domain: true, is_active: true }
      });
      sources.forEach(s => {
        console.log(`  - [${s.id}] ${s.name} (${s.domain}) - Active: ${s.is_active}`);
      });
      process.exit(1);
    }

    console.log(`✓ Found Fanpage source: ID=${fanpageSource.id}, Name="${fanpageSource.name}"`);
    console.log(`  Domain: ${fanpageSource.domain}`);
    console.log(`  Active: ${fanpageSource.is_active}\n`);

    if (!fanpageSource.is_active) {
      console.error('❌ Fanpage source is not active. Cannot scrape.');
      process.exit(1);
    }

    // Get current week
    const weekStart = getCurrentWeekStart();
    console.log(`📅 Scraping for week: ${weekStart.toISOString().split('T')[0]}\n`);

    // Run weekly scraper for Fanpage only
    console.log('⏳ Starting weekly scrape (this may take a few minutes)...\n');
    const result = await runWeeklyScraperCycle({
      weekStart,
      specificSources: [fanpageSource.id],
      sourceGroup: 'all',
      forceRescrape: false,
      dryRun: false,
      triggerType: 'manual'
    });

    // Report results
    console.log('\n📊 Scraping Results:');
    console.log(`  Execution ID: ${result.executionId}`);
    console.log(`  Total jobs: ${result.stats.total}`);
    console.log(`  Enqueued: ${result.stats.enqueued}`);
    console.log(`  Skipped: ${result.stats.skipped}`);
    console.log(`  Failed: ${result.stats.failed}`);
    console.log(`  Duration: ${result.duration}ms\n`);

    if (result.stats.failed > 0) {
      console.warn('⚠️  Some jobs failed. Check logs for details.');
    } else if (result.stats.enqueued > 0) {
      console.log('✅ Weekly scrape for Fanpage enqueued successfully!');
      console.log('   Processing will continue in background.');
    } else {
      console.log('ℹ️  No jobs were enqueued (possibly already cached).');
    }

  } catch (error) {
    console.error('❌ Error triggering weekly scraper:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
