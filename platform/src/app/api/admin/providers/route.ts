import { prisma } from '@/lib/db';
import { handleError, ok, requireAdmin, readJson, fail } from '@/lib/api';
import { providerCreateSchema } from '@/lib/validation';
import { encryptSecret } from '@/lib/crypto';

export async function GET() {
  try {
    await requireAdmin();
    const providers = await prisma.provider.findMany({
      include: { models: { select: { id: true, slug: true, displayName: true, adminEnabled: true } } },
      orderBy: { name: 'asc' },
    });
    return ok({
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        baseUrl: p.baseUrl,
        enabled: p.enabled,
        keyConfigured: Boolean(p.encryptedKey),
        lastTestAt: p.lastTestAt,
        lastTestOk: p.lastTestOk,
        lastTestDetail: p.lastTestDetail,
        models: p.models,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson(req, providerCreateSchema);
    const existing = await prisma.provider.findUnique({ where: { name: body.name } });
    if (existing) return fail(409, `Provider "${body.name}" already exists.`);
    const provider = await prisma.provider.create({
      data: {
        name: body.name,
        baseUrl: body.baseUrl || null,
        encryptedKey: body.apiKey ? encryptSecret(body.apiKey) : null,
        enabled: true,
      },
    });
    await prisma.adminAction.create({
      data: { adminId: admin.id, action: 'create_provider', targetType: 'provider', targetId: provider.id, details: { name: provider.name } },
    });
    return ok({ provider: { id: provider.id, name: provider.name, enabled: provider.enabled, keyConfigured: Boolean(provider.encryptedKey) } });
  } catch (err) {
    return handleError(err);
  }
}
