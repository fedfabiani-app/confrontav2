// This file is kept for compatibility but the actual storage is handled by Prisma
// The job queue and API routes use Prisma directly for database operations

export interface IStorage {
  // Placeholder - actual storage operations are in routes using Prisma
}

export class PrismaStorage implements IStorage {
  // Implementation moved to routes.ts and services
}

export const storage = new PrismaStorage();
