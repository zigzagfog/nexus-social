/**
 * Nexus E2E Encryption — Web Crypto API
 *
 * Each user has an RSA-OAEP 2048 key pair generated in the browser.
 * The public key is uploaded to the server so recipients can encrypt for you.
 * The private key never leaves the browser.
 *
 * To send a message:
 *  1. Generate a one-time AES-GCM 256 session key
 *  2. Encrypt the plaintext with AES-GCM
 *  3. Wrap (encrypt) the AES key with each recipient's RSA public key
 *  4. Store { iv, ciphertext, wrappedKeys: { [userId]: base64 } }
 *
 * To decrypt:
 *  1. Unwrap your wrappedKey with your RSA private key → AES session key
 *  2. Decrypt ciphertext with AES-GCM
 */

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["wrapKey", "unwrapKey"]
  );
}

export async function exportPublicKeyJwk(key: CryptoKey): Promise<string> {
  return JSON.stringify(await crypto.subtle.exportKey("jwk", key));
}

export async function importPublicKeyJwk(jwkStr: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk", JSON.parse(jwkStr),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false, ["wrapKey"]
  );
}

export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
  wrappedKeys: Record<string, string>; // userId → base64 wrapped AES key
}

export async function encryptMessage(
  plaintext: string,
  recipientKeys: Record<string, CryptoKey> // userId → RSA public key
): Promise<EncryptedPayload> {
  const sessionKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sessionKey,
    new TextEncoder().encode(plaintext)
  );
  const wrappedKeys: Record<string, string> = {};
  for (const [uid, pubKey] of Object.entries(recipientKeys)) {
    const wrapped = await crypto.subtle.wrapKey("raw", sessionKey, pubKey, { name: "RSA-OAEP" });
    wrappedKeys[uid] = bufToBase64(new Uint8Array(wrapped));
  }
  return { iv: bufToBase64(iv), ciphertext: bufToBase64(new Uint8Array(ciphertextBuf)), wrappedKeys };
}

export async function decryptMessage(
  payload: EncryptedPayload,
  myUserId: string,
  privateKey: CryptoKey
): Promise<string> {
  const wrapped = payload.wrappedKeys[myUserId];
  if (!wrapped) throw new Error("No key for this user");
  const sessionKey = await crypto.subtle.unwrapKey(
    "raw", base64ToBuf(wrapped), privateKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM", length: 256 },
    false, ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(payload.iv) },
    sessionKey,
    base64ToBuf(payload.ciphertext)
  );
  return new TextDecoder().decode(plain);
}

function bufToBase64(buf: Uint8Array): string {
  return btoa(Array.from(buf).map((b) => String.fromCharCode(b)).join(""));
}
function base64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
