import { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'change-me-immediately';

const PLANS = [
  { slug: 'free', name: 'Free', priceMonthly: 0, priceYearly: null, dailyTokens: 10000, monthlyTokens: 100000, tokensPerMinute: 6000, requestsPerMin: 10, allowedModels: [] as string[], isFree: true },
  { slug: 'pro', name: 'Pro', priceMonthly: 2000, priceYearly: 20000, dailyTokens: 200000, monthlyTokens: 4000000, tokensPerMinute: 60000, requestsPerMin: 60, allowedModels: [] as string[], isFree: false },
  { slug: 'business', name: 'Business', priceMonthly: 10000, priceYearly: 100000, dailyTokens: 2000000, monthlyTokens: 40000000, tokensPerMinute: 250000, requestsPerMin: 300, allowedModels: [] as string[], isFree: false },
];

const MOCK_MODELS = [
  { slug: 'mock-small', displayName: 'Mock Small (free tier)', contextWindow: 8192, maxOutputTokens: 2048, tierRequired: 'free', displayOrder: 0 },
  { slug: 'mock-large', displayName: 'Mock Large (paid tier)', contextWindow: 32768, maxOutputTokens: 8192, tierRequired: 'pro', displayOrder: 1 },
];

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: 'ADMIN' },
    create: {
      email: ADMIN_EMAIL,
      name: 'Administrator',
      role: 'ADMIN',
      emailVerified: new Date(),
      passwordHash: await (await import('bcryptjs')).default.hash(ADMIN_PASSWORD, 12),
    },
  });

  await prisma.tokenBalance.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id, available: BigInt(100000000) },
  });

  const planIds: Record<string, string> = {};
  for (const p of PLANS) {
    const plan = await prisma.plan.upsert({
      where: { slug: p.slug },
      update: p,
      create: p,
    });
    planIds[p.slug] = plan.id;
  }

  const provider = await prisma.provider.upsert({
    where: { name: 'mock' },
    update: { enabled: true },
    create: { name: 'mock', enabled: true },
  });

  for (const m of MOCK_MODELS) {
    await prisma.model.upsert({
      where: { slug: m.slug },
      update: { adminEnabled: true, providerId: provider.id },
      create: { ...m, providerId: provider.id, adminEnabled: true },
    });
  }

  for (const slug of ['mock-small', 'mock-large']) {
    console.log(`seeded model ${slug}`);
  }
  console.log(`seeded admin ${ADMIN_EMAIL} and plans free/pro/business (ids: ${Object.values(planIds).join(', ')})`);
  void Prisma;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
