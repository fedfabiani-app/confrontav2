import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

async function importWeeklySources() {
  try {
    // Read CSV file
    const csvContent = readFileSync('attached_assets/weekly_sources_1760349499558.csv', 'utf-8');
    
    // Parse CSV
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      cast: (value, context) => {
        // Handle quoted timestamps
        if (context.column === 'created_at' || context.column === 'updated_at') {
          return new Date(value.replace(/"/g, ''));
        }
        // Handle boolean values
        if (context.column === 'is_active') {
          return value === 'true';
        }
        // Handle decimal values
        if (context.column === 'reliability_score') {
          return parseFloat(value);
        }
        return value;
      }
    });

    console.log(`Found ${records.length} weekly sources to import`);

    // Clear existing data
    await prisma.weeklySource.deleteMany({});
    console.log('Cleared existing weekly sources');

    // Import records
    for (const record of records) {
      const weeklySource = await prisma.weeklySource.create({
        data: {
          id: parseInt(record.id),
          name: record.name,
          domain: record.domain,
          logo_url: record.logo_url || null,
          base_url: record.base_url,
          url_pattern: record.url_pattern,
          reliability_score: record.reliability_score,
          is_active: record.is_active,
          created_at: record.created_at,
          updated_at: record.updated_at,
        },
      });
      console.log(`✓ Imported: ${weeklySource.name}`);
    }

    console.log(`\n✅ Successfully imported ${records.length} weekly sources!`);
  } catch (error) {
    console.error('Error importing weekly sources:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

importWeeklySources();
