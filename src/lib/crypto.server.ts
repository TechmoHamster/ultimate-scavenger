import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const getKey = () => {
  const raw = process.env.CLUE_PASSWORD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("CLUE_PASSWORD_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CLUE_PASSWORD_ENCRYPTION_KEY must be 32 bytes (base64)");
  }
  return key;
};

export const encryptSecret = (value: string) => {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
};

export const decryptSecret = (ciphertext: string) => {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = ciphertext.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid ciphertext format");
  }
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
};
