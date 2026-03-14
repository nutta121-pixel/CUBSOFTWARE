/**
 * CubVault - Encrypted Vault Database
 * Manages password entries with client-side encryption
 */

import { cryptoEngine } from './crypto';
import { PasswordEntry, VaultData, VaultSettings, EncryptedData } from './types';

export class VaultDatabase {
    private vaultData: VaultData | null = null;
    private masterPassword: string | null = null;
    private isLocked: boolean = true;
    private autoLockTimer: number | null = null;
    private accessToken: string | null = null;

    /**
     * Set access token for server sync
     */
    setAccessToken(token: string | null): void {
        this.accessToken = token;
    }

    /**
     * Check if a vault exists (without unlocking it)
     */
    async hasVault(): Promise<boolean> {
        const data = await this.loadFromStorage('cubvault_data');
        return data !== null;
    }

    /**
     * Create a new encrypted vault
     */
    async createVault(password: string): Promise<boolean> {
        try {
            // Initialize empty vault
            const vault: VaultData = {
                version: '1.0.0',
                entries: [],
                settings: this.getDefaultSettings(),
                createdAt: Date.now(),
                lastModified: Date.now()
            };

            // Encrypt and save vault with account password
            this.vaultData = vault;
            this.masterPassword = password;
            this.isLocked = false;
            await this.saveVault();

            this.startAutoLockTimer();
            return true;
        } catch (error) {
            console.error('Failed to create vault:', error);
            return false;
        }
    }

    /**
     * Unlock existing vault with account password
     * Syncs with server if access token is available
     */
    async unlockVault(password: string): Promise<boolean> {
        try {
            let localVault: string | null = null;
            let localLastModified: number = 0;

            // Load local encrypted vault
            const localEncrypted = await this.loadFromStorage('cubvault_data');
            if (localEncrypted) {
                localVault = localEncrypted;
                // Try to get last modified time
                const localData = await this.loadFromStorage('cubvault_lastmodified');
                if (localData) {
                    localLastModified = parseInt(localData);
                }
            }

            // If access token is available, try to sync with server
            let serverVault: any = null;
            if (this.accessToken && typeof window !== 'undefined') {
                try {
                    const { apiClient } = await import('./desktop/renderer/services/api');
                    const response = await apiClient.getVault(this.accessToken);
                    if (response.vault) {
                        serverVault = response.vault;
                    }
                } catch (error) {
                    console.warn('Failed to fetch vault from server, using local copy:', error);
                }
            }

            // Determine which vault to use
            let encryptedData: EncryptedData;
            let vaultStringForStorage: string | null = null;

            if (serverVault && localVault) {
                // Both exist, use the newer one
                const serverLastModified = new Date(serverVault.lastModified).getTime();
                if (serverLastModified > localLastModified) {
                    encryptedData = this.parseEncryptedData(serverVault.encryptedData);
                    vaultStringForStorage = JSON.stringify(encryptedData);
                    console.log('Using server vault (newer)');
                } else {
                    encryptedData = this.parseEncryptedData(localVault);
                    console.log('Using local vault (newer)');
                }
            } else if (serverVault) {
                encryptedData = this.parseEncryptedData(serverVault.encryptedData);
                vaultStringForStorage = JSON.stringify(encryptedData);
                console.log('Using server vault (no local copy)');
            } else if (localVault) {
                encryptedData = this.parseEncryptedData(localVault);
                console.log('Using local vault (no server copy)');
            } else {
                // No vault exists yet
                return false;
            }

            // Decrypt vault with master password
            const decryptedJson = await cryptoEngine.decrypt(
                encryptedData,
                password
            );
            this.vaultData = JSON.parse(decryptedJson);

            this.masterPassword = password;
            this.isLocked = false;
            this.startAutoLockTimer();

            // Save to local storage if we used server vault
            if (vaultStringForStorage && serverVault) {
                await this.saveToStorage('cubvault_data', vaultStringForStorage);
                await this.saveToStorage('cubvault_lastmodified', new Date(serverVault.lastModified).getTime().toString());
            }

            return true;
        } catch (error) {
            console.error('Failed to unlock vault:', error);
            return false;
        }
    }

    /**
     * Lock the vault (clear sensitive data from memory)
     */
    lockVault(): void {
        this.vaultData = null;
        this.masterPassword = null;
        this.isLocked = true;
        this.accessToken = null;
        this.stopAutoLockTimer();
    }

    /**
     * Check if vault is locked
     */
    isVaultLocked(): boolean {
        return this.isLocked;
    }

    /**
     * Sync vault from server (for real-time updates)
     * Returns true if vault was updated, false if no changes
     */
    async syncFromServer(): Promise<boolean> {
        if (this.isLocked || !this.masterPassword || !this.accessToken) {
            return false;
        }

        try {
            const { apiClient } = await import('./desktop/renderer/services/api');
            const response = await apiClient.getVault(this.accessToken);

            if (!response.vault) {
                return false;
            }

            const serverLastModified = new Date(response.vault.lastModified).getTime();
            const localLastModified = this.vaultData?.lastModified || 0;

            // Only sync if server has newer data
            if (serverLastModified > localLastModified) {
                const encryptedData = this.parseEncryptedData(response.vault.encryptedData);
                const decryptedJson = await cryptoEngine.decrypt(encryptedData, this.masterPassword);
                this.vaultData = JSON.parse(decryptedJson);

                // Save to local storage
                const vaultStringForStorage = JSON.stringify(encryptedData);
                await this.saveToStorage('cubvault_data', vaultStringForStorage);
                await this.saveToStorage('cubvault_lastmodified', serverLastModified.toString());

                console.log('Vault synced from server');
                return true;
            }

            return false;
        } catch (error) {
            console.warn('Failed to sync from server:', error);
            return false;
        }
    }

    /**
     * Maximum passwords per user
     */
    private readonly MAX_PASSWORDS = 1000;

    /**
     * Add new password entry
     */
    async addEntry(entry: Omit<PasswordEntry, 'id' | 'createdAt' | 'updatedAt' | 'passwordHistory'>): Promise<string> {
        this.ensureUnlocked();

        // Check password limit
        if (this.vaultData!.entries.length >= this.MAX_PASSWORDS) {
            throw new Error(`Password limit reached. Maximum ${this.MAX_PASSWORDS} passwords allowed.`);
        }

        const newEntry: PasswordEntry = {
            ...entry,
            id: this.generateId(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            passwordHistory: []
        };

        this.vaultData!.entries.push(newEntry);
        this.vaultData!.lastModified = Date.now();
        await this.saveVault();

        this.resetAutoLockTimer();
        return newEntry.id;
    }

    /**
     * Update existing password entry
     */
    async updateEntry(entryId: string, updates: Partial<PasswordEntry>): Promise<boolean> {
        this.ensureUnlocked();

        const entry = this.vaultData!.entries.find(e => e.id === entryId);
        if (!entry) {
            return false;
        }

        // If password changed, add to history
        if (updates.password && updates.password !== entry.password) {
            entry.passwordHistory.push({
                password: entry.password,
                changedAt: Date.now()
            });
            // Keep only last 10 passwords
            if (entry.passwordHistory.length > 10) {
                entry.passwordHistory.shift();
            }
        }

        Object.assign(entry, updates);
        entry.updatedAt = Date.now();
        this.vaultData!.lastModified = Date.now();
        await this.saveVault();

        this.resetAutoLockTimer();
        return true;
    }

    /**
     * Delete password entry
     */
    async deleteEntry(entryId: string): Promise<boolean> {
        this.ensureUnlocked();

        const index = this.vaultData!.entries.findIndex(e => e.id === entryId);
        if (index === -1) {
            return false;
        }

        this.vaultData!.entries.splice(index, 1);
        this.vaultData!.lastModified = Date.now();
        await this.saveVault();

        this.resetAutoLockTimer();
        return true;
    }

    /**
     * Get all password entries
     */
    getAllEntries(): PasswordEntry[] {
        this.ensureUnlocked();
        this.resetAutoLockTimer();
        return [...this.vaultData!.entries];
    }

    /**
     * Get single entry by ID
     */
    getEntry(entryId: string): PasswordEntry | null {
        this.ensureUnlocked();
        this.resetAutoLockTimer();
        return this.vaultData!.entries.find(e => e.id === entryId) || null;
    }

    /**
     * Search entries by query
     */
    searchEntries(query: string): PasswordEntry[] {
        this.ensureUnlocked();
        const lowerQuery = query.toLowerCase();

        return this.vaultData!.entries.filter(entry =>
            entry.title.toLowerCase().includes(lowerQuery) ||
            entry.username.toLowerCase().includes(lowerQuery) ||
            entry.url?.toLowerCase().includes(lowerQuery) ||
            entry.notes?.toLowerCase().includes(lowerQuery) ||
            entry.category.toLowerCase().includes(lowerQuery) ||
            entry.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    }

    /**
     * Get entries by category
     */
    getEntriesByCategory(category: string): PasswordEntry[] {
        this.ensureUnlocked();
        return this.vaultData!.entries.filter(e => e.category === category);
    }

    /**
     * Get favorite entries
     */
    getFavorites(): PasswordEntry[] {
        this.ensureUnlocked();
        return this.vaultData!.entries.filter(e => e.isFavorite);
    }

    /**
     * Analyze password health - find weak passwords
     */
    getWeakPasswords(): PasswordEntry[] {
        this.ensureUnlocked();
        return this.vaultData!.entries.filter(entry => {
            const strength = cryptoEngine.calculatePasswordStrength(entry.password);
            return strength.score < 60; // Fair or below
        });
    }

    /**
     * Analyze password health - find reused passwords
     */
    getReusedPasswords(): Map<string, PasswordEntry[]> {
        this.ensureUnlocked();
        const passwordMap = new Map<string, PasswordEntry[]>();

        for (const entry of this.vaultData!.entries) {
            if (!passwordMap.has(entry.password)) {
                passwordMap.set(entry.password, []);
            }
            passwordMap.get(entry.password)!.push(entry);
        }

        // Filter to only passwords used more than once
        const reused = new Map<string, PasswordEntry[]>();
        for (const [password, entries] of passwordMap.entries()) {
            if (entries.length > 1) {
                reused.set(password, entries);
            }
        }

        return reused;
    }

    /**
     * Get old passwords (not changed in 6+ months)
     */
    getOldPasswords(monthsThreshold: number = 6): PasswordEntry[] {
        this.ensureUnlocked();
        const thresholdDate = Date.now() - (monthsThreshold * 30 * 24 * 60 * 60 * 1000);

        return this.vaultData!.entries.filter(entry => {
            const lastChanged = entry.passwordHistory.length > 0
                ? entry.passwordHistory[entry.passwordHistory.length - 1].changedAt
                : entry.createdAt;
            return lastChanged < thresholdDate;
        });
    }

    /**
     * Change password (re-encrypts vault with new password)
     */
    async changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
        try {
            // Verify old password by trying to decrypt
            const encryptedVault = await this.loadFromStorage('cubvault_data');
            if (!encryptedVault) {
                throw new Error('No vault found');
            }

            // Try to decrypt with old password
            await cryptoEngine.decrypt(
                JSON.parse(encryptedVault) as EncryptedData,
                oldPassword
            );

            // If successful, re-encrypt vault with new password
            this.masterPassword = newPassword;
            await this.saveVault();

            return true;
        } catch (error) {
            console.error('Failed to change password:', error);
            return false;
        }
    }

    /**
     * Update vault settings
     */
    async updateSettings(settings: Partial<VaultSettings>): Promise<void> {
        this.ensureUnlocked();
        Object.assign(this.vaultData!.settings, settings);
        await this.saveVault();

        // Restart auto-lock with new timeout
        if (settings.autoLockTimeout !== undefined) {
            this.startAutoLockTimer();
        }
    }

    /**
     * Get vault settings
     */
    getSettings(): VaultSettings {
        this.ensureUnlocked();
        return { ...this.vaultData!.settings };
    }

    /**
     * Export vault to JSON (encrypted or plain)
     */
    async exportVault(includePasswords: boolean = true): Promise<string> {
        this.ensureUnlocked();

        const exportData = { ...this.vaultData };

        if (!includePasswords && exportData.entries) {
            exportData.entries = exportData.entries.map(entry => ({
                ...entry,
                password: '[REDACTED]',
                passwordHistory: []
            }));
        }

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Import vault from JSON
     */
    async importVault(jsonData: string, replaceExisting: boolean = false): Promise<number> {
        this.ensureUnlocked();

        try {
            const importedData: VaultData = JSON.parse(jsonData);

            if (replaceExisting) {
                this.vaultData!.entries = importedData.entries;
            } else {
                // Merge entries, avoid duplicates by URL + username
                const existingKeys = new Set(
                    this.vaultData!.entries.map(e => `${e.url}:${e.username}`)
                );

                for (const entry of importedData.entries) {
                    const key = `${entry.url}:${entry.username}`;
                    if (!existingKeys.has(key)) {
                        entry.id = this.generateId(); // Generate new ID
                        this.vaultData!.entries.push(entry);
                    }
                }
            }

            this.vaultData!.lastModified = Date.now();
            await this.saveVault();

            return importedData.entries.length;
        } catch (error) {
            throw new Error(`Import failed: ${(error as Error).message}`);
        }
    }

    /**
     * Get vault statistics
     */
    getStatistics() {
        this.ensureUnlocked();

        const entries = this.vaultData!.entries;
        const weakPasswords = this.getWeakPasswords();
        const reusedPasswords = this.getReusedPasswords();
        const oldPasswords = this.getOldPasswords();

        return {
            totalEntries: entries.length,
            weakPasswords: weakPasswords.length,
            reusedPasswords: reusedPasswords.size,
            oldPasswords: oldPasswords.length,
            categories: this.getCategoryCount(),
            favorites: entries.filter(e => e.isFavorite).length
        };
    }

    // Private helper methods

    /**
     * Parse encrypted data - handles both string and object formats
     */
    private parseEncryptedData(data: string | EncryptedData): EncryptedData {
        if (typeof data === 'string') {
            const parsed = JSON.parse(data);
            // Handle potential double-encoding
            if (typeof parsed === 'string') {
                return JSON.parse(parsed);
            }
            return parsed;
        }
        return data as EncryptedData;
    }

    private ensureUnlocked(): void {
        if (this.isLocked || !this.vaultData) {
            throw new Error('Vault is locked - unlock it first');
        }
    }

    private async saveVault(): Promise<void> {
        if (!this.masterPassword || !this.vaultData) {
            throw new Error('Cannot save - vault not initialized');
        }

        const jsonData = JSON.stringify(this.vaultData);
        const encrypted = await cryptoEngine.encrypt(jsonData, this.masterPassword);
        const encryptedStr = JSON.stringify(encrypted);

        // Save to local storage
        await this.saveToStorage('cubvault_data', encryptedStr);
        await this.saveToStorage('cubvault_lastmodified', this.vaultData.lastModified.toString());

        // Sync to server if access token is available
        if (this.accessToken && typeof window !== 'undefined') {
            try {
                const { apiClient } = await import('./desktop/renderer/services/api');
                await apiClient.updateVault(this.accessToken, encrypted);
                console.log('Vault synced to server');
            } catch (error) {
                console.warn('Failed to sync vault to server:', error);
                // Don't throw error - local save succeeded
            }
        }
    }

    private getDefaultSettings(): VaultSettings {
        return {
            autoLockTimeout: 15, // 15 minutes
            clipboardClearTimeout: 30, // 30 seconds
            passwordGenerator: {
                defaultLength: 16,
                includeUppercase: true,
                includeLowercase: true,
                includeNumbers: true,
                includeSymbols: true,
                excludeAmbiguous: true
            },
            security: {
                requireMasterPasswordOnStartup: true,
                lockOnMinimize: false,
                lockOnScreenLock: true
            }
        };
    }

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private getCategoryCount(): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const entry of this.vaultData!.entries) {
            counts[entry.category] = (counts[entry.category] || 0) + 1;
        }
        return counts;
    }

    // Auto-lock timer management

    private startAutoLockTimer(): void {
        this.stopAutoLockTimer();
        if (this.vaultData) {
            const timeoutMs = this.vaultData.settings.autoLockTimeout * 60 * 1000;
            this.autoLockTimer = setTimeout(() => this.lockVault(), timeoutMs) as unknown as number;
        }
    }

    private stopAutoLockTimer(): void {
        if (this.autoLockTimer !== null) {
            clearTimeout(this.autoLockTimer);
            this.autoLockTimer = null;
        }
    }

    private resetAutoLockTimer(): void {
        if (!this.isLocked) {
            this.startAutoLockTimer();
        }
    }

    // Storage abstraction (works in browser and Node.js/Electron)

    private async saveToStorage(key: string, value: string): Promise<void> {
        if (typeof window !== 'undefined' && window.localStorage) {
            // Browser environment
            window.localStorage.setItem(key, value);
        } else {
            // Node.js/Electron environment
            const fs = await import('fs/promises');
            const path = await import('path');
            const os = await import('os');

            const dataDir = path.join(os.homedir(), '.cubvault');
            await fs.mkdir(dataDir, { recursive: true });
            await fs.writeFile(path.join(dataDir, `${key}.dat`), value, 'utf-8');
        }
    }

    private async loadFromStorage(key: string): Promise<string | null> {
        if (typeof window !== 'undefined' && window.localStorage) {
            // Browser environment
            return window.localStorage.getItem(key);
        } else {
            // Node.js/Electron environment
            const fs = await import('fs/promises');
            const path = await import('path');
            const os = await import('os');

            const filePath = path.join(os.homedir(), '.cubvault', `${key}.dat`);
            try {
                return await fs.readFile(filePath, 'utf-8');
            } catch {
                return null;
            }
        }
    }
}

// Export singleton instance
export const vaultDatabase = new VaultDatabase();
