import { prisma } from '@/lib/db';
import { handleError, ok, requireAdmin, readJson, fail } from '@/lib/api';
import { modelUpsertSchema } from '@/lib/validation';

export async function GET() {
  try {
    await requireAdmin();
    const models = await prisma.model.findMany({
      include: { Provider: { select: { name: true } } },
      orderBy: [{ displayOrder: 'asc' }, { displayName: 'asc' }],
    });
    return ok({ models: models.map((m) => ({ ...m, providerName: m.Provider.name })) });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson(req, modelUpsertSchema);
    const existing = await prisma.model.findUnique({ where: { slug: body.slug } });
    if (existing) return fail(409, `Model "${body.slug}" already exists. Edit it instead.`);
    const created = await prisma.model.create({ data: body });
    await prisma.adminAction.create({ data: { adminId: admin.id, action: 'create_model', targetType: 'model', targetId: created.id, details: { slug: created.slug } } });
    return ok({ model: created });
  } catch (err) { return handleError(err); }
}
