import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Cifrado simétrico AES-256-GCM para secretos guardados en BD (tokens de Meta
// de cada cliente, PIN de su número). La llave vive SOLO en el entorno del
// servidor (META_TOKEN_KEY, 32 bytes en base64): con un volcado de la BD los
// tokens no sirven sin ella.
// Formato guardado: base64(iv[12] | tag[16] | texto cifrado).

function llave(): Buffer {
  const b64 = process.env.META_TOKEN_KEY;
  if (!b64) throw new Error("Falta META_TOKEN_KEY en el entorno");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("META_TOKEN_KEY debe ser de 32 bytes en base64");
  return k;
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", llave(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), datos]).toString("base64");
}

export function descifrar(guardado: string): string {
  const buf = Buffer.from(guardado, "base64");
  const d = createDecipheriv("aes-256-gcm", llave(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}
