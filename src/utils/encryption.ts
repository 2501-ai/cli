import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import Logger from './logger';

// Fields that should be encrypted in storage
export const SENSITIVE_FIELDS = ['remote_exec_password', 'api_key'] as const;
const ENCRYPTION_PREFIX = 'enc:';

/**
 * Generate a deterministic encryption key based on system characteristics
 */
function getSystemKey(): Buffer {
  let unique_id: string;
  try {
    if (process.platform === 'darwin') {
      unique_id = execSync(
        "ioreg -d2 -c IOPlatformExpertDevice | awk -F\\\" '/IOPlatformUUID/{print $(NF-1)}'"
      )
        .toString()
        .trim();
    } else if (process.platform === 'win32') {
      unique_id =
        execSync(
          'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid'
        )
          .toString()
          .trim()
          .split(/\s+/)
          .pop() || '';
    } else {
      if (fs.existsSync('/.dockerenv')) {
        unique_id = process.env.HOSTNAME || os.hostname();
      } else {
        unique_id = execSync(
          'cat /var/lib/dbus/machine-id 2>/dev/null || cat /etc/machine-id'
        )
          .toString()
          .trim();
      }
    }
  } catch (error) {
    // Fallback to hostname + mac address
    const networkInterfaces = os.networkInterfaces();
    const mac =
      Object.values(networkInterfaces)
        .flat()
        .find((iface) => !iface?.internal && iface?.mac)?.mac || '';
    unique_id = `${os.hostname()}-${mac}`;
  }

  Logger.debug('Unique ID:', unique_id);

  // Create a 32-byte key using hostname and unique_id
  return crypto
    .createHash('sha256')
    .update(`${os.hostname()}-${unique_id}`)
    .digest();
}

/**
 * Encrypt a sensitive value
 */
export function encryptValue(value: string): string {
  if (!value || value.startsWith(ENCRYPTION_PREFIX)) {
    return value; // Already encrypted or empty
  }

  Logger.debug('Encrypting value:', value);
  const key = getSystemKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Prepend IV and add prefix
  return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a sensitive value
 */
export function decryptValue(encryptedValue: string): string {
  if (!encryptedValue || !encryptedValue.startsWith(ENCRYPTION_PREFIX)) {
    return encryptedValue; // Not encrypted (backward compatibility)
  }

  Logger.debug('Decrypting value:', encryptedValue);
  try {
    const key = getSystemKey();
    const data = encryptedValue.substring(ENCRYPTION_PREFIX.length);
    const [ivHex, encrypted] = data.split(':');
    const iv = Buffer.from(ivHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.warn('Failed to decrypt value, returning as-is:', error);
    return encryptedValue; // Return as-is if decryption fails
  }
}
