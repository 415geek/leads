import { createHash, timingSafeEqual } from 'node:crypto';

/** 对密码做定长摘要再比较，避免逐字节短路比较 */
export function verifyPasswordConstantTime(input: string, expected: string): boolean {
  const a = createHash('sha256').update(input, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}
