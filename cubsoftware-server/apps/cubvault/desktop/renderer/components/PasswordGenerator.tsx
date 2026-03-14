/**
 * CubVault - Password Generator Component
 */

import React, { useState, useEffect } from 'react';
import { cryptoEngine } from '../../../crypto';
import type { GeneratorOptions, PasswordStrength } from '../../../types';

interface PasswordGeneratorProps {
    onClose: () => void;
    onUsePassword: (password: string) => void;
}

const PasswordGenerator: React.FC<PasswordGeneratorProps> = ({ onClose, onUsePassword }) => {
    const [options, setOptions] = useState<GeneratorOptions>({
        length: 20,
        includeUppercase: true,
        includeLowercase: true,
        includeNumbers: true,
        includeSymbols: true,
        excludeAmbiguous: true
    });
    const [password, setPassword] = useState('');
    const [passwordStrength, setPasswordStrength] = useState<PasswordStrength | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        generatePassword();
    }, []);

    useEffect(() => {
        if (password) {
            const strength = cryptoEngine.calculatePasswordStrength(password);
            setPasswordStrength(strength);
        }
    }, [password]);

    const generatePassword = () => {
        const generated = cryptoEngine.generatePassword(options);
        setPassword(generated);
        setCopied(false);
    };

    const handleOptionChange = (option: keyof GeneratorOptions, value: boolean | number) => {
        setOptions(prev => ({ ...prev, [option]: value }));
    };

    const handleCopy = () => {
        onUsePassword(password);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getStrengthColor = (score: number): string => {
        if (score < 20) return '#ff4757';
        if (score < 40) return '#ff6b81';
        if (score < 60) return '#ffa502';
        if (score < 80) return '#7bed9f';
        return '#2ed573';
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal generator-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Password Generator</h2>
                    <button className="close-btn" onClick={onClose}>
                        <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/>
                        </svg>
                    </button>
                </div>

                <div className="modal-body">
                    <div className="generated-password">
                        <code className="password-display">{password}</code>
                        <div className="password-actions">
                            <button className="action-btn" onClick={generatePassword} title="Regenerate">
                                <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
                                    <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/>
                                </svg>
                            </button>
                            <button
                                className={`action-btn ${copied ? 'copied' : ''}`}
                                onClick={handleCopy}
                                title="Copy to Clipboard"
                            >
                                {copied ? (
                                    <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
                                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="#2ed573"/>
                                    </svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
                                        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/>
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {passwordStrength && (
                        <div className="strength-indicator">
                            <div className="strength-bar">
                                <div
                                    className="strength-fill"
                                    style={{
                                        width: `${passwordStrength.score}%`,
                                        backgroundColor: getStrengthColor(passwordStrength.score)
                                    }}
                                />
                            </div>
                            <div className="strength-info">
                                <span style={{ color: getStrengthColor(passwordStrength.score) }}>
                                    {passwordStrength.rating}
                                </span>
                                <span className="crack-time">
                                    Estimated crack time: {passwordStrength.estimatedCrackTime}
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="generator-options">
                        <div className="option-group">
                            <label htmlFor="length">Password Length: {options.length}</label>
                            <input
                                type="range"
                                id="length"
                                min="8"
                                max="64"
                                value={options.length}
                                onChange={(e) => handleOptionChange('length', parseInt(e.target.value))}
                            />
                            <div className="range-labels">
                                <span>8</span>
                                <span>64</span>
                            </div>
                        </div>

                        <div className="checkbox-options">
                            <label className="checkbox-option">
                                <input
                                    type="checkbox"
                                    checked={options.includeUppercase}
                                    onChange={(e) => handleOptionChange('includeUppercase', e.target.checked)}
                                />
                                <span className="checkmark"></span>
                                <span>Uppercase (A-Z)</span>
                            </label>

                            <label className="checkbox-option">
                                <input
                                    type="checkbox"
                                    checked={options.includeLowercase}
                                    onChange={(e) => handleOptionChange('includeLowercase', e.target.checked)}
                                />
                                <span className="checkmark"></span>
                                <span>Lowercase (a-z)</span>
                            </label>

                            <label className="checkbox-option">
                                <input
                                    type="checkbox"
                                    checked={options.includeNumbers}
                                    onChange={(e) => handleOptionChange('includeNumbers', e.target.checked)}
                                />
                                <span className="checkmark"></span>
                                <span>Numbers (0-9)</span>
                            </label>

                            <label className="checkbox-option">
                                <input
                                    type="checkbox"
                                    checked={options.includeSymbols}
                                    onChange={(e) => handleOptionChange('includeSymbols', e.target.checked)}
                                />
                                <span className="checkmark"></span>
                                <span>Symbols (!@#$%^&*)</span>
                            </label>

                            <label className="checkbox-option">
                                <input
                                    type="checkbox"
                                    checked={options.excludeAmbiguous}
                                    onChange={(e) => handleOptionChange('excludeAmbiguous', e.target.checked)}
                                />
                                <span className="checkmark"></span>
                                <span>Exclude Ambiguous (0, O, l, 1)</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn secondary" onClick={onClose}>
                        Close
                    </button>
                    <button className="btn primary" onClick={generatePassword}>
                        <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                            <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/>
                        </svg>
                        Regenerate
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PasswordGenerator;
