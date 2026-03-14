/**
 * CubVault - API Client Service
 * Handles communication with the CubVault backend server for vault sync
 */

import type { EncryptedData } from '../../../types';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

interface VaultResponse {
    vault: {
        encryptedData: string | EncryptedData;
        lastModified: string;
    } | null;
}

interface UpdateVaultResponse {
    success: boolean;
    lastModified: string;
}

class ApiClient {
    private baseUrl: string;

    constructor() {
        this.baseUrl = API_BASE_URL;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;

        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        return response.json();
    }

    /**
     * Get the encrypted vault from the server
     */
    async getVault(accessToken: string): Promise<VaultResponse> {
        return this.request<VaultResponse>('/api/vault', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
    }

    /**
     * Update/save the encrypted vault to the server
     */
    async updateVault(accessToken: string, encryptedData: EncryptedData): Promise<UpdateVaultResponse> {
        return this.request<UpdateVaultResponse>('/api/vault', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ encryptedData }),
        });
    }

    /**
     * Login to get an access token
     */
    async login(email: string, password: string): Promise<{ accessToken: string; user: { id: string; email: string } }> {
        return this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    }

    /**
     * Register a new account
     */
    async register(email: string, password: string): Promise<{ accessToken: string; user: { id: string; email: string } }> {
        return this.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    }

    /**
     * Check if the server is available
     */
    async healthCheck(): Promise<{ status: string }> {
        return this.request('/api/health');
    }
}

export const apiClient = new ApiClient();
