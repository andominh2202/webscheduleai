import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Reuse one client per warm serverless instance. Prisma's connection_limit
// bounds the number of connections per instance, but a transaction pooler
// is still recommended when Vercel scales to multiple instances.
function databaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '1');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '20');
    }
    if (url.hostname.includes('pooler.supabase.com') && (!url.port || url.port === '5432')) {
      url.port = '6543';
    }
    if (
      (url.port === '6543' || url.hostname.includes('pooler.supabase.com')) &&
      !url.searchParams.has('pgbouncer')
    ) {
      url.searchParams.set('pgbouncer', 'true');
    }
    return url.toString();
  } catch {
    return raw;
  }
}

const url = databaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(
    url ? { datasources: { db: { url } } } : undefined
  );

globalForPrisma.prisma = prisma;
