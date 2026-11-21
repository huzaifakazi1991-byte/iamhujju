import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/db';
import { sha256 } from '@/lib/crypto';
import { sendMail, mailConfigured } from '@/lib/mail';

const OTP_TTL_MS = 10 * 60 * 1000;

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function otpHash(userId: string, code: string): string {
  return sha256(`otp:${userId}:${code}`);
}

export async function issueOtp(userId: string, email: string, name: string | null): Promise<{ sent: boolean }> {
  if (!mailConfigured()) return { sent: false };
  const code = generateOtpCode();
  await prisma.verificationToken.deleteMany({ where: { userId } });
  await prisma.verificationToken.create({
    data: { userId, tokenHash: otpHash(userId, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  const { delivered } = await sendMail({
    to: email,
    subject: 'Your IamHujju AI verification code',
    text: `Hello${name ? ` ${name}` : ''},\n\nYour IamHujju AI verification code is: ${code}\n\nIt expires in 10 minutes. If you did not request this, ignore this email.\n\n— IamHujju AI`,
  });
  return { sent: delivered };
}

export async function verifyOtp(userId: string, code: string): Promise<boolean> {
  const row = await prisma.verificationToken.findUnique({ where: { tokenHash: otpHash(userId, code) } });
  if (!row || row.expiresAt < new Date()) return false;
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } }),
    prisma.verificationToken.delete({ where: { id: row.id } }),
  ]);
  return true;
}
