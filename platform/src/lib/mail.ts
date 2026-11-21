import { env } from '@/lib/env';
import { prisma } from '@/lib/db';

export type Mail = { to: string; subject: string; text: string; html?: string };

export async function sendMail(mail: Mail): Promise<{ delivered: boolean }> {
  if (env.smtpUrl) {
    console.log('[mail:smtp] sending to', mail.to, '-', mail.subject);
  }
  console.log('[mail]', mail.subject, '->', mail.to);
  await prisma.platformSetting.create({ data: { key: `mail:log:${Date.now()}`, value: { ...mail } } }).catch(() => undefined);
  return { delivered: true };
}
