/**
 * CubVault - Main App Component
 * Password Manager by CUB Software
 */

import React, { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import { vaultDatabase } from '../../database';

type View = 'login' | 'dashboard';

declare global {
    interface Window {
        electronAPI: {
            minimizeWindow: () => void;
            maximizeWindow: () => void;
            closeWindow: () => void;
            copyToClipboard: (text: string, clearAfter?: number) => void;
            onLockVault: (callback: () => void) => void;
            onClipboardCleared: (callback: () => void) => void;
        };
    }
}

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<View>('login');
    const [isLoading, setIsLoading] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    useEffect(() => {
        // Listen for lock vault event from system tray
        window.electronAPI?.onLockVault(() => {
            handleLock();
        });

        // Listen for clipboard cleared notification
        window.electronAPI?.onClipboardCleared(() => {
            showNotification('success', 'Clipboard cleared for security');
        });
    }, []);

    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 3000);
    };

    const handleUnlock = async (password: string, isNewVault: boolean): Promise<boolean> => {
        setIsLoading(true);
        try {
            let success: boolean;
            if (isNewVault) {
                success = await vaultDatabase.createVault(password);
            } else {
                success = await vaultDatabase.unlockVault(password);
            }

            if (success) {
                setCurrentView('dashboard');
                return true;
            } else {
                showNotification('error', 'Incorrect password or vault not found');
                return false;
            }
        } catch (error) {
            showNotification('error', 'Failed to unlock vault');
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    const handleLock = () => {
        vaultDatabase.lockVault();
        setCurrentView('login');
    };

    const handleCopyToClipboard = (text: string) => {
        const settings = vaultDatabase.getSettings();
        window.electronAPI?.copyToClipboard(text, settings.clipboardClearTimeout);
        showNotification('success', 'Copied to clipboard');
    };

    return (
        <div className="app">
            {/* Custom Title Bar */}
            <div className="title-bar">
                <div className="title-bar-drag">
                    <img src="../../assets/icon.png" alt="" className="title-bar-icon" />
                    <span className="title-bar-text">CubVault</span>
                </div>
                <div className="title-bar-controls">
                    <button
                        className="title-btn minimize"
                        onClick={() => window.electronAPI?.minimizeWindow()}
                    >
                        ─
                    </button>
                    <button
                        className="title-btn maximize"
                        onClick={() => window.electronAPI?.maximizeWindow()}
                    >
                        □
                    </button>
                    <button
                        className="title-btn close"
                        onClick={() => window.electronAPI?.closeWindow()}
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Notification Toast */}
            {notification && (
                <div className={`notification ${notification.type}`}>
                    {notification.message}
                </div>
            )}

            {/* Main Content */}
            <div className="app-content">
                {currentView === 'login' ? (
                    <LoginScreen
                        onUnlock={handleUnlock}
                        isLoading={isLoading}
                    />
                ) : (
                    <Dashboard
                        onLock={handleLock}
                        onCopy={handleCopyToClipboard}
                        showNotification={showNotification}
                    />
                )}
            </div>
        </div>
    );
};

export default App;
