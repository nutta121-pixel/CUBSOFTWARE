/**
 * CubVault - Password List Component
 */

import React, { useState } from 'react';
import { cryptoEngine } from '../../../crypto';
import type { PasswordEntry } from '../../../types';

interface PasswordListProps {
    entries: PasswordEntry[];
    selectedEntry: PasswordEntry | null;
    onSelect: (entry: PasswordEntry) => void;
    onEdit: (entry: PasswordEntry) => void;
    onDelete: (entryId: string) => void;
    onToggleFavorite: (entry: PasswordEntry) => void;
    onCopy: (text: string) => void;
}

const PasswordList: React.FC<PasswordListProps> = ({
    entries,
    selectedEntry,
    onSelect,
    onEdit,
    onDelete,
    onToggleFavorite,
    onCopy
}) => {
    const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});

    const toggleShowPassword = (entryId: string) => {
        setShowPassword(prev => ({
            ...prev,
            [entryId]: !prev[entryId]
        }));
    };

    const getStrengthColor = (password: string): string => {
        const strength = cryptoEngine.calculatePasswordStrength(password);
        if (strength.score < 20) return '#ff4757';
        if (strength.score < 40) return '#ff6b81';
        if (strength.score < 60) return '#ffa502';
        if (strength.score < 80) return '#7bed9f';
        return '#2ed573';
    };

    const formatDate = (timestamp: number): string => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const getInitials = (title: string): string => {
        return title
            .split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    };

    if (entries.length === 0) {
        return (
            <div className="password-list empty">
                <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" width="64" height="64">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor" opacity="0.3"/>
                    </svg>
                    <h3>No passwords found</h3>
                    <p>Add your first password to get started</p>
                </div>
            </div>
        );
    }

    return (
        <div className="password-list">
            {entries.map(entry => (
                <div
                    key={entry.id}
                    className={`password-item ${selectedEntry?.id === entry.id ? 'selected' : ''}`}
                    onClick={() => onSelect(entry)}
                >
                    <div className="item-avatar" style={{ backgroundColor: getStrengthColor(entry.password) + '20' }}>
                        <span style={{ color: getStrengthColor(entry.password) }}>
                            {getInitials(entry.title)}
                        </span>
                    </div>

                    <div className="item-content">
                        <div className="item-header">
                            <h4 className="item-title">{entry.title}</h4>
                            {entry.isFavorite && <span className="favorite-star">★</span>}
                        </div>
                        <p className="item-username">{entry.username}</p>
                        {entry.url && <p className="item-url">{entry.url}</p>}
                    </div>

                    <div className="item-actions">
                        <button
                            className="item-action-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onCopy(entry.username);
                            }}
                            title="Copy Username"
                        >
                            <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/>
                            </svg>
                        </button>

                        <button
                            className="item-action-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleShowPassword(entry.id);
                            }}
                            title={showPassword[entry.id] ? 'Hide Password' : 'Show Password'}
                        >
                            {showPassword[entry.id] ? (
                                <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                                    <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" fill="currentColor"/>
                                </svg>
                            ) : (
                                <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/>
                                </svg>
                            )}
                        </button>

                        <button
                            className="item-action-btn copy-password"
                            onClick={(e) => {
                                e.stopPropagation();
                                onCopy(entry.password);
                            }}
                            title="Copy Password"
                        >
                            <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" fill="currentColor"/>
                            </svg>
                        </button>

                        <button
                            className="item-action-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite(entry);
                            }}
                            title={entry.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                        >
                            <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                                <path
                                    d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                                    fill={entry.isFavorite ? '#ffc107' : 'currentColor'}
                                />
                            </svg>
                        </button>

                        <button
                            className="item-action-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(entry);
                            }}
                            title="Edit"
                        >
                            <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
                            </svg>
                        </button>

                        <button
                            className="item-action-btn delete"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(entry.id);
                            }}
                            title="Delete"
                        >
                            <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
                            </svg>
                        </button>
                    </div>

                    {showPassword[entry.id] && (
                        <div className="password-preview">
                            <code>{entry.password}</code>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default PasswordList;
