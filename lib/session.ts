import { SignJWT, jwtVerify } from 'jose';

const COOKIE_NAME = 'rlf_session';

export function getSessionCookieName(): string {
  return COOKIE_NAME;
}

function getSecretKey(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) return null;
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(email: string): Promise<string | null> {
  const key = getSecretKey();
  if (!key) return null;
  return new SignJWT({ sub: email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
}

export async function verifySessionToken(token: string): Promise<boolean> {
  const key = getSecretKey();
  if (!key) return false;
  try {
    await jwtVerify(token, key);
    return true;
  } catch {
    return false;
  }
}
