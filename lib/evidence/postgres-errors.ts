export function isMissingSchemaError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '42703' || err.code === '42P01') return true;
  const m = (err.message ?? '').toLowerCase();
  return (
    /column .* does not exist/.test(m) ||
    /could not find the '.*' column/.test(m) ||
    /relation .* does not exist/.test(m)
  );
}
