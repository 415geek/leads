/**
 * Email → password map from env: legacy AUTH_ALLOWED_EMAIL + AUTH_PASSWORD,
 * plus optional AUTH_USERS_JSON object { "email": "password", ... }.
 */
export function getAuthCredentialMap(): Map<string, string> {
  const map = new Map<string, string>();

  const primaryEmail = process.env.AUTH_ALLOWED_EMAIL?.trim().toLowerCase();
  const primaryPassword = process.env.AUTH_PASSWORD;
  if (primaryEmail && primaryPassword) {
    map.set(primaryEmail, primaryPassword);
  }

  const raw = process.env.AUTH_USERS_JSON?.trim();
  if (!raw) return map;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return map;
    for (const [email, pass] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof pass !== 'string' || !pass) continue;
      const key = email.trim().toLowerCase();
      if (key) map.set(key, pass);
    }
  } catch {
    // malformed JSON: treat as no extra users
  }

  return map;
}

export function isAuthSecretConfigured(): boolean {
  const secret = process.env.AUTH_SECRET;
  return Boolean(secret && secret.length >= 16);
}
