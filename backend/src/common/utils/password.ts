import { hash, verify } from '@node-rs/argon2';

// argon2id with the OWASP-recommended minimums (19 MiB memory, 2 iterations).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/** Checked when the username does not exist, so both paths take the same time. */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword('no-such-user-placeholder');
  return dummy;
}
