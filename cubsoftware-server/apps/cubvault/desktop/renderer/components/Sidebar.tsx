/**
 * CubVault - Sidebar Component
 */

import React from 'react';

interface SidebarProps {
    viewMode: string;
    stats: {
        totalEntries: number;
        weakPasswords: number;
        reusedPasswords: number;
        oldPasswords: number;
        favorites: number;
    };
    categories: string[];
    selectedCategory: string;
    onViewChange: (mode: 'all' | 'favorites' | 'weak' | 'settings') => void;
    onCategorySelect: (category: string) => void;
    onAddNew: () => void;
    onGeneratePassword: () => void;
    onLock: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
    viewMode,
    stats,
    categories,
    selectedCategory,
    onViewChange,
    onCategorySelect,
    onAddNew,
    onGeneratePassword,
    onLock
}) => {
    const getCategoryIcon = (category: string): string => {
        const icons: Record<string, string> = {
            'Social': '👥',
            'Work': '💼',
            'Finance': '💰',
            'Shopping': '🛒',
            'Entertainment': '🎮',
            'Email': '📧',
            'Development': '💻',
            'Other': '📁'
        };
        return icons[category] || '📁';
    };

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <div className="vault-info">
                    <span className="vault-count">{stats.totalEntries}</span>
                    <span className="vault-label">Passwords</span>
                </div>
            </div>

            <div className="sidebar-actions">
                <button className="action-btn primary" onClick={onAddNew}>
                    <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                        <path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
                    </svg>
                    Add New
                </button>
                <button className="action-btn secondary" onClick={onGeneratePassword}>
                    <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                        <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/>
                    </svg>
                    Generate
                </button>
            </div>

            <nav className="sidebar-nav">
                <div className="nav-section">
                    <h3 className="nav-section-title">Quick Access</h3>
                    <ul className="nav-list">
                        <li
                            className={`nav-item ${viewMode === 'all' ? 'active' : ''}`}
                            onClick={() => onViewChange('all')}
                        >
                            <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93s3.05-7.44 7-7.93v15.86zm2-15.86c1.03.13 2 .45 2.87.93H13v-.93zM13 7h5.24c.25.31.48.65.68 1H13V7zm0 3h6.74c.08.33.15.66.19 1H13v-1zm0 9.93V19h2.87c-.87.48-1.84.8-2.87.93zM18.24 17H13v-1h5.92c-.2.35-.43.69-.68 1zm1.5-3H13v-1h6.93c-.04.34-.11.67-.19 1z" fill="currentColor"/>
                            </svg>
                            <span>All Passwords</span>
                            <span className="nav-count">{stats.totalEntries}</span>
                        </li>
                        <li
                            className={`nav-item ${viewMode === 'favorites' ? 'active' : ''}`}
                            onClick={() => onViewChange('favorites')}
                        >
                            <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="currentColor"/>
                            </svg>
                            <span>Favorites</span>
                            <span className="nav-count">{stats.favorites}</span>
                        </li>
                        <li
                            className={`nav-item ${viewMode === 'weak' ? 'active' : ''}`}
                            onClick={() => onViewChange('weak')}
                        >
                            <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor"/>
                            </svg>
                            <span>Weak Passwords</span>
                            <span className="nav-count warning">{stats.weakPasswords}</span>
                        </li>
                    </ul>
                </div>

                {categories.length > 0 && (
                    <div className="nav-section">
                        <h3 className="nav-section-title">Categories</h3>
                        <ul className="nav-list">
                            {categories.map(category => (
                                <li
                                    key={category}
                                    className={`nav-item ${viewMode === 'category' && selectedCategory === category ? 'active' : ''}`}
                                    onClick={() => onCategorySelect(category)}
                                >
                                    <span className="category-icon">{getCategoryIcon(category)}</span>
                                    <span>{category}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </nav>

            <div className="sidebar-footer">
                <button className="lock-btn" onClick={onLock}>
                    <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" fill="currentColor"/>
                    </svg>
                    Lock Vault
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
