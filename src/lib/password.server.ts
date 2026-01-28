import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

const ITERATIONS = 100_000;
const KEYLEN = 32;
const DIGEST = "sha256";

export const normalizePassword = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

export const hashPassword = (password: string) => {
  const normalized = normalizePassword(password);
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(normalized, salt, ITERATIONS, KEYLEN, DIGEST);
  return `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
};

export const verifyPassword = (password: string, stored: string) => {
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const [algo, iterStr, saltB64, hashB64] = parts;
  if (algo !== "pbkdf2") return false;
  const iterations = Number(iterStr);
  if (!Number.isFinite(iterations)) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const hash = pbkdf2Sync(normalizePassword(password), salt, iterations, expected.length, DIGEST);
  return timingSafeEqual(hash, expected);
};
