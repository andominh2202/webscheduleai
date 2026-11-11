import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const PREFIX = 'scrypt';
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${PREFIX}$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<{ valid: boolean; legacy: boolean }> {
  if (!stored) return { valid: false, legacy: false };
  if (stored.startsWith(`${PREFIX}$`)) {
    const parts = stored.split('$');
    if (parts.length !== 3 || !/^[0-9a-f]{32}$/.test(parts[1]) || !/^[0-9a-f]{128}$/.test(parts[2])) {
      return { valid: false, legacy: false };
    }
    const expected = Buffer.from(parts[2], 'hex');
    const actual = (await scrypt(password, parts[1], KEY_LENGTH)) as Buffer;
    return { valid: timingSafeEqual(expected, actual), legacy: false };
  }
  // Compatibility for existing plaintext passwords. Upgrade after successful authentication.
  const actual = Buffer.from(password);
  const expected = Buffer.from(stored);
  return { valid: actual.length === expected.length && timingSafeEqual(actual, expected), legacy: true };
}
