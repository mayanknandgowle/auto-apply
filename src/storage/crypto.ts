import { z } from 'zod';
export const KDF_ITERATIONS = 600000;
const bytes = (length: number) => z.array(z.number().int().min(0).max(255)).length(length);
export const VaultHeader = z.object({
  version: z.literal(1), vaultId: z.string().uuid(), salt: bytes(16), iterations: z.number().int().min(KDF_ITERATIONS).max(2000000),
  iv: bytes(12), wrapped: bytes(48), idleMinutes: z.number().int().min(1).max(60)
}).strict();
export type VaultHeader = z.infer<typeof VaultHeader>;
const wrapAAD = (vaultId: string,idleMinutes:number) => new TextEncoder().encode(`applypilot-vault-key:1:${vaultId}:${idleMinutes}`);
async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  if (passphrase.length > 1024) throw new Error('Passphrase is too long.');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function wrapKey(key: CryptoKey, passphrase: string, idleMinutes = 15, vaultId: string = crypto.randomUUID()): Promise<VaultHeader> {
  if (passphrase.length < 12 || passphrase.length > 1024) throw new Error('Use a passphrase of 12–1,024 characters. There is no recovery if you forget it.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const kek = await derive(passphrase, salt, KDF_ITERATIONS);
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: wrapAAD(vaultId,idleMinutes) }, kek, await crypto.subtle.exportKey('raw', key));
  return VaultHeader.parse({ version: 1, vaultId, salt: [...salt], iterations: KDF_ITERATIONS, iv: [...iv], wrapped: [...new Uint8Array(wrapped)], idleMinutes });
}
export async function unwrapKey(header: VaultHeader, passphrase: string): Promise<CryptoKey> {
  const parsed = VaultHeader.parse(header);
  try {
    const kek = await derive(passphrase, new Uint8Array(parsed.salt), parsed.iterations);
    const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(parsed.iv), additionalData: wrapAAD(parsed.vaultId,parsed.idleMinutes) }, kek, new Uint8Array(parsed.wrapped));
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
  } catch { throw new Error('Passphrase is incorrect or the encrypted backup is damaged. No saved data was changed.'); }
}
export function base64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(binary);
}
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) throw new Error('The backup encoding is invalid.');
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}
