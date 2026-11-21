import { TOPUP_PACKS } from '@/lib/topup';
import { handleError, ok, requireUser } from '@/lib/api';

export async function GET() {
  try {
    await requireUser();
    return ok({ packs: TOPUP_PACKS });
  } catch (err) {
    return handleError(err);
  }
}
