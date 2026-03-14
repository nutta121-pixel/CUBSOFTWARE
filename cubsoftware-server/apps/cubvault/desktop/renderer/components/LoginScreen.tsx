/**
 * CubVault - Login Screen Component
 */

import React, { useState, useEffect } from 'react';
import { cryptoEngine } from '../../../crypto';
import { vaultDatabase } from '../../../database';
import type { PasswordStrength } from '../../../types';

interface LoginScreenProps {
    onUnlock: (password: string, isNewVault: boolean) => Promise<boolean>;
    isLoading: boolean;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onUnlock, isLoading }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isNewVault, setIsNewVault] = useState<boolean | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [passwordStrength, setPasswordStrength] = useState<PasswordStrength | null>(null);

    useEffect(() => {
        // Check if vault exists using database method (works in both browser and Electron)
        vaultDatabase.hasVault().then(hasVault => {
            setIsNewVault(!hasVault);
        });
    }, []);

    useEffect(() => {
        if (isNewVault && password) {
            const strength = cryptoEngine.calculatePasswordStrength(password);
            setPasswordStrength(strength);
        } else {
            setPasswordStrength(null);
        }
    }, [password, isNewVault]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!password) {
            setError('Please enter your master password');
            return;
        }

        if (isNewVault) {
            if (password.length < 8) {
                setError('Password must be at least 8 characters');
                return;
            }
            if (password !== confirmPassword) {
                setError('Passwords do not match');
                return;
            }
            if (passwordStrength && passwordStrength.score < 40) {
                setError('Password is too weak. Please choose a stronger password.');
                return;
            }
        }

        const success = await onUnlock(password, isNewVault!);
        if (!success) {
            setError(isNewVault ? 'Failed to create vault' : 'Incorrect master password');
        }
    };

    const getStrengthColor = (score: number): string => {
        if (score < 20) return '#ff4757';
        if (score < 40) return '#ff6b81';
        if (score < 60) return '#ffa502';
        if (score < 80) return '#7bed9f';
        return '#2ed573';
    };

    // Show loading while checking if vault exists
    if (isNewVault === null) {
        return (
            <div className="login-screen">
                <div className="login-container">
                    <div className="login-logo">
                        <div className="logo-icon">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 2C9.24 2 7 4.24 7 7V10H6C4.9 10 4 10.9 4 12V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V12C20 10.9 19.1 10 18 10H17V7C17 4.24 14.76 2 12 2ZM12 4C13.66 4 15 5.34 15 7V10H9V7C9 5.34 10.34 4 12 4ZM12 14C13.1 14 14 14.9 14 16C14 17.1 13.1 18 12 18C10.9 18 10 17.1 10 16C10 14.9 10.9 14 12 14Z" fill="currentColor"/>
                            </svg>
                        </div>
                        <h1 className="login-title">CubVault</h1>
                        <p className="login-subtitle">Loading...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="login-screen">
            <div className="login-container">
                <div className="login-logo">
                    <div className="logo-icon">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2C9.24 2 7 4.24 7 7V10H6C4.9 10 4 10.9 4 12V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V12C20 10.9 19.1 10 18 10H17V7C17 4.24 14.76 2 12 2ZM12 4C13.66 4 15 5.34 15 7V10H9V7C9 5.34 10.34 4 12 4ZM12 14C13.1 14 14 14.9 14 16C14 17.1 13.1 18 12 18C10.9 18 10 17.1 10 16C10 14.9 10.9 14 12 14Z" fill="currentColor"/>
                        </svg>
                    </div>
                    <h1 className="login-title">CubVault</h1>
                    <p className="login-subtitle">
                        {isNewVault ? 'Create your secure vault' : 'Welcome back'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                        <label htmlFor="password">Master Password</label>
                        <div className="password-input-wrapper">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your master password"
                                autoFocus
                            />
                            <button
                                type="button"
                                className="toggle-password"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? '👁️' : '👁️‍🗨️'}
                            </button>
                        </div>
                    </div>

                    {isNewVault && (
                        <>
                            <div className="form-group">
                                <label htmlFor="confirmPassword">Confirm Password</label>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="confirmPassword"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm your master password"
                                />
                            </div>

                            {passwordStrength && (
                                <div className="password-strength">
                                    <div className="strength-bar">
                                        <div
                                            className="strength-fill"
                                            style={{
                                                width: `${passwordStrength.score}%`,
                                                backgroundColor: getStrengthColor(passwordStrength.score)
                                            }}
                                        />
                                    </div>
                                    <span
                                        className="strength-label"
                                        style={{ color: getStrengthColor(passwordStrength.score) }}
                                    >
                                        {passwordStrength.rating}
                                    </span>
                                </div>
                            )}
                        </>
                    )}

                    {error && <div className="error-message">{error}</div>}

                    <button
                        type="submit"
                        className="login-button"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <span className="loading-spinner"></span>
                        ) : (
                            isNewVault ? 'Create Vault' : 'Unlock'
                        )}
                    </button>
                </form>

                <div className="login-footer">
                    <p className="security-notice">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
                            <path d="M12 1L3 5V11C3 16.55 6.84 21.74 12 23C17.16 21.74 21 16.55 21 11V5L12 1ZM12 11.99H19C18.47 16.11 15.72 19.78 12 20.93V12H5V6.3L12 3.19V11.99Z" fill="currentColor"/>
                        </svg>
                        Your data is encrypted with AES-256-GCM
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
