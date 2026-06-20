import crypto from 'crypto';
import zlib from 'zlib';
import CryptoJS from 'crypto-js';
import pako from 'pako';

const KEY_STRING = '!@#)(*$%123ZXC!@!@#)(NHL';
const DES_KEY_BUFFER = Buffer.from(KEY_STRING, 'latin1');

/**
 * Decrypt QRC lyrics using Node's native crypto and zlib.inflateRawSync.
 * @param hex Hex-encoded ciphertext
 */
export function decryptQrcNative(hex: string): string {
  try {
    const inputBuffer = Buffer.from(hex, 'hex');
    
    // Triple DES EDE3 ECB decryption
    const decipher = crypto.createDecipheriv('des-ede3', DES_KEY_BUFFER, null);
    decipher.setAutoPadding(false);
    
    const decrypted = Buffer.concat([decipher.update(inputBuffer), decipher.final()]);
    
    // zlib raw deflate decompression
    return zlib.inflateRawSync(decrypted).toString('utf-8');
  } catch (error: any) {
    throw new Error(`Native QRC decryption/decompression failed: ${error.message}`);
  }
}

/**
 * Decrypt QRC lyrics using CryptoJS and pako (for browser-aligned frontend validation).
 * @param base64 Base64-encoded ciphertext
 */
export function decryptQrcCryptoJs(base64: string): string {
  const key = CryptoJS.enc.Latin1.parse(KEY_STRING);
  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Base64.parse(base64)
  });

  const decrypted = CryptoJS.TripleDES.decrypt(cipherParams, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.NoPadding
  });

  // Convert CryptoJS WordArray to Uint8Array
  const sigBytes = decrypted.sigBytes;
  const words = decrypted.words;
  const u8 = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    const byte = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    u8[i] = byte;
  }

  // pako raw deflate decompression
  return pako.inflateRaw(u8, { to: 'string' });
}
