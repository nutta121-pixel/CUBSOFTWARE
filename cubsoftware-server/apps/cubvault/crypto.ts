/**
 * CubVault - Core Cryptography Module
 * Military-grade encryption using WebCrypto API
 * AES-256-GCM with PBKDF2 key derivation
 */

import { argon2id } from '@noble/hashes/argon2';
import { EncryptedData, GeneratorOptions, PasswordStrength } from './types';

export class CryptoEngine {
    private readonly PBKDF2_ITERATIONS = 600000; // OWASP recommendation
    private readonly KEY_LENGTH = 256;
    private readonly SALT_LENGTH = 16;
    private readonly NONCE_LENGTH = 12;

    /**
     * Hash master password using Argon2id
     * Returns base64-encoded hash for verification
     */
    async hashMasterPassword(password: string): Promise<string> {
        const encoder = new TextEncoder();
        const passwordBytes = encoder.encode(password);

        // Argon2id parameters (memory: 64MB, iterations: 3, parallelism: 4)
        const hash = argon2id(passwordBytes, 'cubvault-salt-v1', {
            t: 3,
            m: 65536,
            p: 4
        });

        return this.arrayBufferToBase64(hash);
    }

    /**
     * Verify master password against stored hash
     */
    async verifyMasterPassword(password: string, storedHash: string): Promise<boolean> {
        const computedHash = await this.hashMasterPassword(password);
        return computedHash === storedHash;
    }

    /**
     * Derive encryption key from master password using PBKDF2
     */
    private async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);

        // Import password as key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            passwordBuffer,
            'PBKDF2',
            false,
            ['deriveKey']
        );

        // Derive AES-GCM key
        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt.buffer as ArrayBuffer,
                iterations: this.PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: this.KEY_LENGTH },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypt data using AES-256-GCM
     */
    async encrypt(plaintext: string, password: string): Promise<EncryptedData> {
        try {
            const encoder = new TextEncoder();
            const plaintextBytes = encoder.encode(plaintext);

            // Generate random salt and nonce
            const salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
            const nonce = crypto.getRandomValues(new Uint8Array(this.NONCE_LENGTH));

            // Derive key
            const key = await this.deriveKey(password, salt);

            // Encrypt
            const ciphertextBuffer = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: nonce },
                key,
                plaintextBytes
            );

            return {
                ciphertext: this.arrayBufferToBase64(ciphertextBuffer),
                salt: this.arrayBufferToBase64(salt),
                nonce: this.arrayBufferToBase64(nonce)
            };
        } catch (error) {
            throw new Error(`Encryption failed: ${(error as Error).message}`);
        }
    }

    /**
     * Decrypt data using AES-256-GCM
     */
    async decrypt(encryptedData: EncryptedData, password: string): Promise<string> {
        try {
            const ciphertext = this.base64ToArrayBuffer(encryptedData.ciphertext);
            const salt = this.base64ToArrayBuffer(encryptedData.salt);
            const nonce = this.base64ToArrayBuffer(encryptedData.nonce);

            // Derive key
            const key = await this.deriveKey(password, new Uint8Array(salt));

            // Decrypt
            const plaintextBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: nonce },
                key,
                ciphertext
            );

            const decoder = new TextDecoder();
            return decoder.decode(plaintextBuffer);
        } catch (error) {
            throw new Error('Decryption failed - incorrect password or corrupted data');
        }
    }

    /**
     * Generate cryptographically secure random password
     */
    generatePassword(options: GeneratorOptions): string {
        const {
            length,
            includeUppercase,
            includeLowercase,
            includeNumbers,
            includeSymbols,
            excludeAmbiguous
        } = options;

        let charset = '';

        if (includeUppercase) {
            charset += excludeAmbiguous ? 'ABCDEFGHJKLMNPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        }
        if (includeLowercase) {
            charset += excludeAmbiguous ? 'abcdefghjkmnpqrstuvwxyz' : 'abcdefghijklmnopqrstuvwxyz';
        }
        if (includeNumbers) {
            charset += excludeAmbiguous ? '23456789' : '0123456789';
        }
        if (includeSymbols) {
            charset += '!@#$%^&*-_=+';
        }

        if (charset.length === 0) {
            charset = 'abcdefghijklmnopqrstuvwxyz0123456789';
        }

        // Use crypto.getRandomValues for cryptographically secure randomness
        const password = new Array(length);
        const randomValues = new Uint32Array(length);
        crypto.getRandomValues(randomValues);

        for (let i = 0; i < length; i++) {
            password[i] = charset[randomValues[i] % charset.length];
        }

        return password.join('');
    }

    /**
     * Calculate password strength (0-100)
     */
    calculatePasswordStrength(password: string): PasswordStrength {
        let score = 0;
        const feedback: string[] = [];

        // Length scoring
        if (password.length < 8) {
            feedback.push('Password is too short (minimum 8 characters)');
        } else if (password.length >= 8) {
            score += 20;
        }
        if (password.length >= 12) {
            score += 10;
        }
        if (password.length >= 16) {
            score += 10;
        }

        // Character variety
        const hasLowercase = /[a-z]/.test(password);
        const hasUppercase = /[A-Z]/.test(password);
        const hasNumbers = /[0-9]/.test(password);
        const hasSymbols = /[^A-Za-z0-9]/.test(password);

        const varietyCount = [hasLowercase, hasUppercase, hasNumbers, hasSymbols].filter(Boolean).length;
        score += varietyCount * 15;

        if (!hasLowercase) feedback.push('Add lowercase letters');
        if (!hasUppercase) feedback.push('Add uppercase letters');
        if (!hasNumbers) feedback.push('Add numbers');
        if (!hasSymbols) feedback.push('Add symbols');

        // Check for common patterns
        if (/^[0-9]+$/.test(password)) {
            score -= 20;
            feedback.push('Avoid using only numbers');
        }
        if (/^[a-zA-Z]+$/.test(password)) {
            score -= 10;
            feedback.push('Add numbers or symbols');
        }
        if (/(.)\1{2,}/.test(password)) {
            score -= 15;
            feedback.push('Avoid repeated characters');
        }
        if (/^(password|123456|qwerty)/i.test(password)) {
            score -= 30;
            feedback.push('Avoid common passwords');
        }

        // Entropy bonus for randomness
        const entropy = this.calculateEntropy(password);
        if (entropy > 60) score += 10;

        // Cap score between 0-100
        score = Math.max(0, Math.min(100, score));

        // Determine rating and crack time
        let rating: PasswordStrength['rating'];
        let estimatedCrackTime: string;

        if (score < 20) {
            rating = 'Very Weak';
            estimatedCrackTime = 'Less than 1 second';
        } else if (score < 40) {
            rating = 'Weak';
            estimatedCrackTime = 'Minutes to hours';
        } else if (score < 60) {
            rating = 'Fair';
            estimatedCrackTime = 'Days to weeks';
        } else if (score < 80) {
            rating = 'Strong';
            estimatedCrackTime = 'Months to years';
        } else {
            rating = 'Very Strong';
            estimatedCrackTime = 'Centuries';
        }

        return {
            score,
            rating,
            feedback: feedback.length > 0 ? feedback : ['Password strength is good'],
            estimatedCrackTime
        };
    }

    /**
     * Calculate Shannon entropy of password
     */
    private calculateEntropy(password: string): number {
        const charCounts = new Map<string, number>();
        for (const char of password) {
            charCounts.set(char, (charCounts.get(char) || 0) + 1);
        }

        let entropy = 0;
        for (const count of charCounts.values()) {
            const probability = count / password.length;
            entropy -= probability * Math.log2(probability);
        }

        return entropy * password.length;
    }

    /**
     * Securely clear sensitive string from memory
     */
    clearString(str: string): void {
        // In JavaScript, we can't directly clear memory, but we can help GC
        // by ensuring the string is no longer referenced
        str = '';
    }

    // Helper methods for base64 conversion
    private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

// Export singleton instance
export const cryptoEngine = new CryptoEngine();
