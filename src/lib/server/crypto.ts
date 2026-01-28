import crypto from "crypto";

function getKey() {
  const raw = process.env.APP_ENCRYPTION_KEY ?? "";
  if (!raw) return null;

  // Expect base64 32 bytes.
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) return null;
    return buf;
  } catch {
    return null;
  }
}

export function canEncrypt() {
  return Boolean(getKey());
}

export function encryptString(plaintext: string) {
  const key = getKey();
  if (!key) throw new Error("Missing APP_ENCRYPTION_KEY");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // v1:<iv_b64>:<tag_b64>:<cipher_b64>
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptString(payload: string) {
  const key = getKey();
  if (!key) throw new Error("Missing APP_ENCRYPTION_KEY");

  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Invalid ciphertext format");

  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ciphertext = Buffer.from(parts[3], "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

