import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-insecure-jwt-secret-change-me-please-32ch';

const USER_PAGES = ['/playground', '/dashboard', '/settings', '/billing', '/keys'];
const ADMIN_PAGES = ['/admin'];

function secret() { return new TextEncoder().encode(JWT_SECRET); }

async function claims(req: NextRequest) {
  const token = req.cookies.get('iam_access')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.type !== 'access') return null;
    return payload as unknown as { sub: string; role: 'USER' | 'ADMIN' };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const origin = req.headers.get('origin');
    if (origin) {
      try {
        const o = new URL(origin);
        const h = req.headers.get('host');
        if (h && o.host !== h) {
          return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid Origin header.' }, { status: 403 });
      }
    }
  }

  if (USER_PAGES.some((p) => pathname.startsWith(p)) || ADMIN_PAGES.some((p) => pathname.startsWith(p))) {
    const c = await claims(req);
    if (!c) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    if (ADMIN_PAGES.some((p) => pathname.startsWith(p)) && c.role !== 'ADMIN') {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|ico)).*)'],
};
