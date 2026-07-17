
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface WeeklySource {
  id: string;
  name: string;
  domain: string;
  logo_url: string;
  base_url: string;
  url_pattern: string;
  reliability_score: string;
  is_active: string;
  created_at: string;
  updated_at: string;
}

async function importWeeklySources() {
  console.log('Starting import of weekly sources...');
  
  // Read CSV file
  const csvPath = path.join(__dirname, '..', 'attached_assets', 'weekly_sources_1760349499558.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  
  // Parse CSV (skip header)
  const lines = csvContent.split('\n').slice(1).filter(line => line.trim());
  
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  
  for (const line of lines) {
    // Parse CSV line (handle quoted fields)
    const fields = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    if (!fields || fields.length < 10) continue;
    
    const cleanField = (field: string) => field.replace(/^"|"$/g, '').replace(/""/g, '"');
    
    const source = {
      id: parseInt(cleanField(fields[0])),
      name: cleanField(fields[1]),
      domain: cleanField(fields[2]),
      logo_url: cleanField(fields[3]) || null,
      base_url: cleanField(fields[4]),
      url_pattern: cleanField(fields[5]),
      reliability_score: parseFloat(cleanField(fields[6])),
      is_active: cleanField(fields[7]) === 'true',
    };
    
    try {
      // Check if source already exists
      const existing = await prisma.source.findUnique({
        where: { domain: source.domain }
      });
      
      if (existing) {
        // Update existing source
        await prisma.source.update({
          where: { domain: source.domain },
          data: {
            name: source.name,
            logo_url: source.logo_url,
            base_url: source.base_url,
            url_pattern: source.url_pattern,
            reliability_score: source.reliability_score,
            is_active: source.is_active,
          }
        });
        updated++;
        console.log(`✓ Updated: ${source.name}`);
      } else {
        // Insert new source
        await prisma.source.create({
          data: {
            name: source.name,
            domain: source.domain,
            logo_url: source.logo_url,
            base_url: source.base_url,
            url_pattern: source.url_pattern,
            reliability_score: source.reliability_score,
            is_active: source.is_active,
          }
        });
        imported++;
        console.log(`✓ Imported: ${source.name}`);
      }
    } catch (error) {
      console.error(`✗ Error processing ${source.name}:`, error);
      skipped++;
    }
  }
  
  console.log('\n=== Import Summary ===');
  console.log(`Imported: ${imported}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log('=====================\n');
  
  await prisma.$disconnect();
}

importWeeklySources()
  .then(() => {
    console.log('Import completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Import failed:', error);
    process.exit(1);
  });
