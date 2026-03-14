/**
 * CubVault - Dashboard Component
 */

import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import PasswordList from './PasswordList';
import PasswordForm from './PasswordForm';
import PasswordGenerator from './PasswordGenerator';
import { vaultDatabase } from '../../../database';
import type { PasswordEntry } from '../../../types';

interface DashboardProps {
    onLock: () => void;
    onCopy: (text: string) => void;
    showNotification: (type: 'success' | 'error', message: string) => void;
}

type ViewMode = 'all' | 'favorites' | 'category' | 'search' | 'weak' | 'settings';

const Dashboard: React.FC<DashboardProps> = ({ onLock, onCopy, showNotification }) => {
    const [entries, setEntries] = useState<PasswordEntry[]>([]);
    const [filteredEntries, setFilteredEntries] = useState<PasswordEntry[]>([]);
    const [selectedEntry, setSelectedEntry] = useState<PasswordEntry | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [showGenerator, setShowGenerator] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [stats, setStats] = useState({
        totalEntries: 0,
        weakPasswords: 0,
        reusedPasswords: 0,
        oldPasswords: 0,
        favorites: 0
    });

    useEffect(() => {
        loadEntries();
    }, []);

    useEffect(() => {
        filterEntries();
    }, [entries, viewMode, selectedCategory, searchQuery]);

    const loadEntries = () => {
        try {
            const allEntries = vaultDatabase.getAllEntries();
            setEntries(allEntries);
            updateStats();
        } catch (error) {
            showNotification('error', 'Failed to load entries');
        }
    };

    const updateStats = () => {
        try {
            const vaultStats = vaultDatabase.getStatistics();
            setStats(vaultStats);
        } catch (error) {
            console.error('Failed to get stats:', error);
        }
    };

    const filterEntries = () => {
        let filtered = [...entries];

        switch (viewMode) {
            case 'favorites':
                filtered = entries.filter(e => e.isFavorite);
                break;
            case 'category':
                if (selectedCategory) {
                    filtered = entries.filter(e => e.category === selectedCategory);
                }
                break;
            case 'search':
                if (searchQuery) {
                    filtered = vaultDatabase.searchEntries(searchQuery);
                }
                break;
            case 'weak':
                filtered = vaultDatabase.getWeakPasswords();
                break;
            default:
                break;
        }

        setFilteredEntries(filtered);
    };

    const handleSearch = (query: string) => {
        setSearchQuery(query);
        setViewMode('search');
    };

    const handleCategorySelect = (category: string) => {
        setSelectedCategory(category);
        setViewMode('category');
    };

    const handleAddNew = () => {
        setSelectedEntry(null);
        setIsEditing(false);
        setShowForm(true);
    };

    const handleEdit = (entry: PasswordEntry) => {
        setSelectedEntry(entry);
        setIsEditing(true);
        setShowForm(true);
    };

    const handleDelete = async (entryId: string) => {
        if (confirm('Are you sure you want to delete this password?')) {
            try {
                await vaultDatabase.deleteEntry(entryId);
                loadEntries();
                showNotification('success', 'Password deleted');
                if (selectedEntry?.id === entryId) {
                    setSelectedEntry(null);
                }
            } catch (error) {
                showNotification('error', 'Failed to delete password');
            }
        }
    };

    const handleToggleFavorite = async (entry: PasswordEntry) => {
        try {
            await vaultDatabase.updateEntry(entry.id, { isFavorite: !entry.isFavorite });
            loadEntries();
        } catch (error) {
            showNotification('error', 'Failed to update favorite');
        }
    };

    const handleSaveEntry = async (entryData: Partial<PasswordEntry>) => {
        try {
            if (isEditing && selectedEntry) {
                await vaultDatabase.updateEntry(selectedEntry.id, entryData);
                showNotification('success', 'Password updated');
            } else {
                await vaultDatabase.addEntry(entryData as Omit<PasswordEntry, 'id' | 'createdAt' | 'updatedAt' | 'passwordHistory'>);
                showNotification('success', 'Password added');
            }
            loadEntries();
            setShowForm(false);
        } catch (error) {
            showNotification('error', (error as Error).message || 'Failed to save password');
        }
    };

    const getCategories = (): string[] => {
        const categories = new Set<string>();
        entries.forEach(e => categories.add(e.category));
        return Array.from(categories).sort();
    };

    return (
        <div className="dashboard">
            <Sidebar
                viewMode={viewMode}
                stats={stats}
                categories={getCategories()}
                selectedCategory={selectedCategory}
                onViewChange={(mode) => {
                    setViewMode(mode);
                    setSelectedCategory('');
                }}
                onCategorySelect={handleCategorySelect}
                onAddNew={handleAddNew}
                onGeneratePassword={() => setShowGenerator(true)}
                onLock={onLock}
            />

            <div className="main-content">
                <div className="content-header">
                    <div className="search-bar">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
                            <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z" fill="currentColor"/>
                        </svg>
                        <input
                            type="text"
                            placeholder="Search passwords..."
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                        />
                    </div>
                    <button className="add-button" onClick={handleAddNew}>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
                            <path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
                        </svg>
                        Add Password
                    </button>
                </div>

                <PasswordList
                    entries={filteredEntries}
                    selectedEntry={selectedEntry}
                    onSelect={setSelectedEntry}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onToggleFavorite={handleToggleFavorite}
                    onCopy={onCopy}
                />
            </div>

            {showForm && (
                <PasswordForm
                    entry={isEditing ? selectedEntry : null}
                    onSave={handleSaveEntry}
                    onCancel={() => setShowForm(false)}
                    onGeneratePassword={() => setShowGenerator(true)}
                />
            )}

            {showGenerator && (
                <PasswordGenerator
                    onClose={() => setShowGenerator(false)}
                    onUsePassword={(password) => {
                        onCopy(password);
                        setShowGenerator(false);
                    }}
                />
            )}
        </div>
    );
};

export default Dashboard;
