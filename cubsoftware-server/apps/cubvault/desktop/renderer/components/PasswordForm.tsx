/**
 * CubVault - Password Form Component
 */

import React, { useState, useEffect } from 'react';
import { cryptoEngine } from '../../../crypto';
import type { PasswordEntry, PasswordStrength } from '../../../types';

interface PasswordFormProps {
    entry: PasswordEntry | null;
    onSave: (data: Partial<PasswordEntry>) => void;
    onCancel: () => void;
    onGeneratePassword: () => void;
}

const CATEGORIES = [
    'Social',
    'Work',
    'Finance',
    'Shopping',
    'Entertainment',
    'Email',
    'Development',
    'Other'
];

const PasswordForm: React.FC<PasswordFormProps> = ({
    entry,
    onSave,
    onCancel,
    onGeneratePassword
}) => {
    const [formData, setFormData] = useState({
        title: '',
        username: '',
        password: '',
        url: '',
        notes: '',
        category: 'Other',
        tags: [] as string[],
        isFavorite: false
    });
    const [showPassword, setShowPassword] = useState(false);
    const [tagInput, setTagInput] = useState('');
    const [passwordStrength, setPasswordStrength] = useState<PasswordStrength | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (entry) {
            setFormData({
                title: entry.title,
                username: entry.username,
                password: entry.password,
                url: entry.url || '',
                notes: entry.notes || '',
                category: entry.category,
                tags: entry.tags,
                isFavorite: entry.isFavorite
            });
        }
    }, [entry]);

    useEffect(() => {
        if (formData.password) {
            const strength = cryptoEngine.calculatePasswordStrength(formData.password);
            setPasswordStrength(strength);
        } else {
            setPasswordStrength(null);
        }
    }, [formData.password]);

    const handleChange = (field: string, value: string | boolean) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
        }
    };

    const handleAddTag = () => {
        if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
            setFormData(prev => ({
                ...prev,
                tags: [...prev.tags, tagInput.trim()]
            }));
            setTagInput('');
        }
    };

    const handleRemoveTag = (tag: string) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.filter(t => t !== tag)
        }));
    };

    const handleGeneratePassword = () => {
        const generated = cryptoEngine.generatePassword({
            length: 20,
            includeUppercase: true,
            includeLowercase: true,
            includeNumbers: true,
            includeSymbols: true,
            excludeAmbiguous: true
        });
        handleChange('password', generated);
    };

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.title.trim()) {
            newErrors.title = 'Title is required';
        }
        if (!formData.username.trim()) {
            newErrors.username = 'Username is required';
        }
        if (!formData.password) {
            newErrors.password = 'Password is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validate()) {
            onSave(formData);
        }
    };

    const getStrengthColor = (score: number): string => {
        if (score < 20) return '#ff4757';
        if (score < 40) return '#ff6b81';
        if (score < 60) return '#ffa502';
        if (score < 80) return '#7bed9f';
        return '#2ed573';
    };

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal password-form-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{entry ? 'Edit Password' : 'Add Password'}</h2>
                    <button className="close-btn" onClick={onCancel}>
                        <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/>
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-body">
                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="title">Title *</label>
                            <input
                                type="text"
                                id="title"
                                value={formData.title}
                                onChange={(e) => handleChange('title', e.target.value)}
                                placeholder="e.g., Google Account"
                                className={errors.title ? 'error' : ''}
                            />
                            {errors.title && <span className="error-text">{errors.title}</span>}
                        </div>
                        <div className="form-group">
                            <label htmlFor="category">Category</label>
                            <select
                                id="category"
                                value={formData.category}
                                onChange={(e) => handleChange('category', e.target.value)}
                            >
                                {CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="username">Username / Email *</label>
                        <input
                            type="text"
                            id="username"
                            value={formData.username}
                            onChange={(e) => handleChange('username', e.target.value)}
                            placeholder="e.g., user@example.com"
                            className={errors.username ? 'error' : ''}
                        />
                        {errors.username && <span className="error-text">{errors.username}</span>}
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password *</label>
                        <div className="password-input-group">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="password"
                                value={formData.password}
                                onChange={(e) => handleChange('password', e.target.value)}
                                placeholder="Enter password"
                                className={errors.password ? 'error' : ''}
                            />
                            <button
                                type="button"
                                className="input-btn"
                                onClick={() => setShowPassword(!showPassword)}
                                title={showPassword ? 'Hide Password' : 'Show Password'}
                            >
                                {showPassword ? '👁️' : '👁️‍🗨️'}
                            </button>
                            <button
                                type="button"
                                className="input-btn generate"
                                onClick={handleGeneratePassword}
                                title="Generate Password"
                            >
                                <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                                    <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/>
                                </svg>
                            </button>
                        </div>
                        {errors.password && <span className="error-text">{errors.password}</span>}

                        {passwordStrength && (
                            <div className="password-strength-indicator">
                                <div className="strength-bar">
                                    <div
                                        className="strength-fill"
                                        style={{
                                            width: `${passwordStrength.score}%`,
                                            backgroundColor: getStrengthColor(passwordStrength.score)
                                        }}
                                    />
                                </div>
                                <span style={{ color: getStrengthColor(passwordStrength.score) }}>
                                    {passwordStrength.rating} - {passwordStrength.estimatedCrackTime}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label htmlFor="url">Website URL</label>
                        <input
                            type="url"
                            id="url"
                            value={formData.url}
                            onChange={(e) => handleChange('url', e.target.value)}
                            placeholder="https://example.com"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="notes">Notes</label>
                        <textarea
                            id="notes"
                            value={formData.notes}
                            onChange={(e) => handleChange('notes', e.target.value)}
                            placeholder="Additional notes..."
                            rows={3}
                        />
                    </div>

                    <div className="form-group">
                        <label>Tags</label>
                        <div className="tags-input">
                            <div className="tags-list">
                                {formData.tags.map(tag => (
                                    <span key={tag} className="tag">
                                        {tag}
                                        <button type="button" onClick={() => handleRemoveTag(tag)}>×</button>
                                    </span>
                                ))}
                            </div>
                            <input
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddTag();
                                    }
                                }}
                                placeholder="Add tag and press Enter"
                            />
                        </div>
                    </div>

                    <div className="form-group checkbox-group">
                        <label>
                            <input
                                type="checkbox"
                                checked={formData.isFavorite}
                                onChange={(e) => handleChange('isFavorite', e.target.checked)}
                            />
                            <span>Add to Favorites</span>
                        </label>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn secondary" onClick={onCancel}>
                            Cancel
                        </button>
                        <button type="submit" className="btn primary">
                            {entry ? 'Update' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PasswordForm;
