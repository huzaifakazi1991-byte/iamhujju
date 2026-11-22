import { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'change-me-immediately';

const PLANS = [
  { slug: 'free', name: 'Free', priceMonthly: 0, priceYearly: null, priceMonthlyInrPaise: 0, priceYearlyInrPaise: null, dailyTokens: 10000, monthlyTokens: 100000, tokensPerMinute: 6000, requestsPerMin: 10, allowedModels: [] as string[], isFree: true },
  { slug: 'pro', name: 'Pro', priceMonthly: 1476, priceYearly: 15942, priceMonthlyInrPaise: 129900, priceYearlyInrPaise: 1402900, dailyTokens: 200000, monthlyTokens: 4000000, tokensPerMinute: 60000, requestsPerMin: 60, allowedModels: [] as string[], isFree: false },
  { slug: 'business', name: 'Business', priceMonthly: 10226, priceYearly: 110442, priceMonthlyInrPaise: 899900, priceYearlyInrPaise: 9718900, dailyTokens: 2000000, monthlyTokens: 40000000, tokensPerMinute: 250000, requestsPerMin: 300, allowedModels: [] as string[], isFree: false },
];

const GEMINI_MODELS = [
  { slug: 'gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', capability: 'chat', contextWindow: 1048576, maxOutputTokens: 65536, tierRequired: 'free', displayOrder: 10 },
  { slug: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', capability: 'chat', contextWindow: 1048576, maxOutputTokens: 65536, tierRequired: 'free', displayOrder: 11 },
  { slug: 'gemini-3.6-flash', displayName: 'Gemini 3.6 Flash', capability: 'chat', contextWindow: 1048576, maxOutputTokens: 65536, tierRequired: 'pro', displayOrder: 12 },
  { slug: 'gemini-4-neon', displayName: 'Gemini 4 Neon', capability: 'chat', contextWindow: 1048576, maxOutputTokens: 65536, tierRequired: 'pro', displayOrder: 13 },
  { slug: 'gemini-4-carbon', displayName: 'Gemini 4 Carbon', capability: 'chat', contextWindow: 1048576, maxOutputTokens: 65536, tierRequired: 'business', displayOrder: 14 },
  { slug: 'imagen-4.0-generate-001', displayName: 'Imagen 4 (image generation)', capability: 'image', contextWindow: 480, maxOutputTokens: 1, tierRequired: 'pro', displayOrder: 15 },
];

// Google retired the 2.5 family for new API keys — keep the rows but hide them.
const GEMINI_RETIRED = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'];

const MOCK_MODELS = [
  { slug: 'mock-small', displayName: 'Mock Small (free tier)', capability: 'chat', contextWindow: 8192, maxOutputTokens: 2048, tierRequired: 'free', displayOrder: 0 },
  { slug: 'mock-large', displayName: 'Mock Large (paid tier)', capability: 'chat', contextWindow: 32768, maxOutputTokens: 8192, tierRequired: 'pro', displayOrder: 1 },
  { slug: 'mock-image', displayName: 'Mock Image (free demo)', capability: 'image', contextWindow: 480, maxOutputTokens: 1, tierRequired: 'free', displayOrder: 2 },
  { slug: 'mock-video', displayName: 'Mock Video (demo)', capability: 'video', contextWindow: 480, maxOutputTokens: 1, tierRequired: 'pro', displayOrder: 3 },
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
      update: { adminEnabled: true, providerId: provider.id, capability: m.capability },
      create: { ...m, providerId: provider.id, adminEnabled: true },
    });
  }

  // Classify any models that predate the capability column (idempotent).
  for (const m of await prisma.model.findMany({ select: { id: true, slug: true, capability: true } })) {
    if (m.capability === 'chat' && /^(imagen|dall-e|flux)/.test(m.slug)) {
      await prisma.model.update({ where: { id: m.id }, data: { capability: 'image' } });
    }
  }

  const geminiProvider = await prisma.provider.upsert({
    where: { name: 'gemini' },
    update: {},
    create: { name: 'gemini', enabled: false },
  });

  for (const m of GEMINI_MODELS) {
    await prisma.model.upsert({
      where: { slug: m.slug },
      update: { providerId: geminiProvider.id, displayName: m.displayName, capability: m.capability, contextWindow: m.contextWindow, maxOutputTokens: m.maxOutputTokens, tierRequired: m.tierRequired },
      create: { ...m, providerId: geminiProvider.id, adminEnabled: true },
    });
  }

  for (const slug of ['mock-small', 'mock-large']) {
    console.log(`seeded model ${slug}`);
  }
  for (const slug of GEMINI_RETIRED) {
    await prisma.model.updateMany({ where: { slug }, data: { adminEnabled: false } });
  }

  for (const m of GEMINI_MODELS) {
    await prisma.model.updateMany({ where: { slug: m.slug }, data: { adminEnabled: true } });
    console.log(`seeded model ${m.slug} (gemini, tier ${m.tierRequired}) — paste your Gemini API key in Admin → Providers to activate`);
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
