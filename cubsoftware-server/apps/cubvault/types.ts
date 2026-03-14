/**
 * CubVault - Core Type Definitions
 * Cross-platform password manager by CUB Software
 */

export interface PasswordEntry {
    id: string;
    title: string;
    username: string;
    password: string;
    url?: string;
    notes?: string;
    category: string;
    tags: string[];
    createdAt: number;
    updatedAt: number;
    passwordHistory: Array<{
        password: string;
        changedAt: number;
    }>;
    isFavorite: boolean;
    customFields?: Array<{
        label: string;
        value: string;
        isSecret: boolean;
    }>;
}

export interface VaultData {
    version: string;
    entries: PasswordEntry[];
    settings: VaultSettings;
    createdAt: number;
    lastModified: number;
}

export interface VaultSettings {
    autoLockTimeout: number; // minutes
    clipboardClearTimeout: number; // seconds
    passwordGenerator: {
        defaultLength: number;
        includeUppercase: boolean;
        includeLowercase: boolean;
        includeNumbers: boolean;
        includeSymbols: boolean;
        excludeAmbiguous: boolean;
    };
    security: {
        requireMasterPasswordOnStartup: boolean;
        lockOnMinimize: boolean;
        lockOnScreenLock: boolean;
    };
}

export interface PasswordStrength {
    score: number; // 0-100
    rating: 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
    feedback: string[];
    estimatedCrackTime: string;
}

export interface EncryptedData {
    ciphertext: string;
    salt: string;
    nonce: string;
}

export interface GeneratorOptions {
    length: number;
    includeUppercase: boolean;
    includeLowercase: boolean;
    includeNumbers: boolean;
    includeSymbols: boolean;
    excludeAmbiguous: boolean;
}

// Server authentication types
export interface User {
    id: string;
    email: string;
    createdAt: string;
}

export interface AuthResponse {
    accessToken: string;
    user: User;
}
