import { prisma } from '@/lib/db';
import { handleError, ok, requireAdmin, readJson } from '@/lib/api';
import { z } from 'zod';

const schema = z.object({ key: z.string().min(1).max(80), value: z.boolean() });

export async function GET() {
  try {
    await requireAdmin();
    const settings = await prisma.platformSetting.findMany({ where: { key: { startsWith: 'toggle:' } } });
    const mailLogs = await prisma.platformSetting.findMany({
      where: { key: { startsWith: 'mail:log:' } },
      orderBy: { key: 'desc' },
      take: 50,
    });
    return ok({
      settings: settings.map((s) => ({ key: s.key.replace('toggle:', ''), value: s.value })),
      mailLogs: mailLogs.map((s) => ({
        to: (s.value as { to?: string }).to ?? '',
        subject: (s.value as { subject?: string }).subject ?? '',
        delivered: (s.value as { delivered?: boolean }).delivered === true,
      })),
    });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const { key, value } = await readJson(req, schema);
    const v = value ?? false;
    const setting = await prisma.platformSetting.upsert({
      where: { key: `toggle:${key}` },
      create: { key: `toggle:${key}`, value: v },
      update: { value: v },
    });
    await prisma.adminAction.create({ data: { adminId: admin.id, action: 'set_setting', targetType: 'setting', targetId: setting.key, details: { value } } });
    return ok({ setting: { key: setting.key.replace('toggle:', ''), value: setting.value } });
  } catch (err) { return handleError(err); }
}
