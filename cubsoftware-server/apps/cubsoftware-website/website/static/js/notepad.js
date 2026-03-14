// Note Pad JavaScript

class NotePad {
    constructor() {
        this.notes = [];
        this.currentNoteId = null;
        this.saveTimeout = null;

        this.initElements();
        this.loadNotes();
        this.bindEvents();
        this.setupMobileSidebar();
    }

    initElements() {
        this.notesList = document.getElementById('notesList');
        this.noteTitle = document.getElementById('noteTitle');
        this.noteContent = document.getElementById('noteContent');
        this.saveStatus = document.getElementById('saveStatus');
        this.charCount = document.getElementById('charCount');
        this.wordCount = document.getElementById('wordCount');
        this.newNoteBtn = document.getElementById('newNoteBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.copyBtn = document.getElementById('copyBtn');
        this.deleteBtn = document.getElementById('deleteBtn');
        this.sidebarToggle = document.getElementById('sidebarToggle');
        this.notesSidebar = document.getElementById('notesSidebar');
        this.toast = document.getElementById('toast');
    }

    loadNotes() {
        try {
            const saved = localStorage.getItem('notepadNotes');
            if (saved) {
                this.notes = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Error loading notes:', e);
            this.notes = [];
        }

        // Create a default note if none exist
        if (this.notes.length === 0) {
            this.createNewNote();
        } else {
            this.renderNotesList();
            this.loadNote(this.notes[0].id);
        }
    }

    saveNotes() {
        try {
            localStorage.setItem('notepadNotes', JSON.stringify(this.notes));
        } catch (e) {
            console.error('Error saving notes:', e);
        }
    }

    bindEvents() {
        // New note button
        this.newNoteBtn.addEventListener('click', () => this.createNewNote());

        // Title changes
        this.noteTitle.addEventListener('input', () => this.scheduleAutoSave());

        // Content changes
        this.noteContent.addEventListener('input', () => {
            this.updateCounts();
            this.scheduleAutoSave();
        });

        // Download button
        this.downloadBtn.addEventListener('click', () => this.downloadNote());

        // Copy button
        this.copyBtn.addEventListener('click', () => this.copyNote());

        // Delete button
        this.deleteBtn.addEventListener('click', () => this.deleteNote());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveCurrentNote();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                this.createNewNote();
            }
        });
    }

    setupMobileSidebar() {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.id = 'sidebarOverlay';
        document.body.appendChild(overlay);

        // Toggle sidebar
        this.sidebarToggle.addEventListener('click', () => {
            this.notesSidebar.classList.toggle('open');
            overlay.classList.toggle('show');
        });

        // Close sidebar when clicking overlay
        overlay.addEventListener('click', () => {
            this.notesSidebar.classList.remove('open');
            overlay.classList.remove('show');
        });
    }

    closeMobileSidebar() {
        this.notesSidebar.classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('show');
    }

    createNewNote() {
        const note = {
            id: Date.now().toString(),
            title: 'Untitled Note',
            content: '',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        this.notes.unshift(note);
        this.saveNotes();
        this.renderNotesList();
        this.loadNote(note.id);
        this.closeMobileSidebar();

        // Focus on title for immediate editing
        this.noteTitle.focus();
        this.noteTitle.select();
    }

    loadNote(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        this.currentNoteId = noteId;
        this.noteTitle.value = note.title;
        this.noteContent.value = note.content;
        this.updateCounts();

        // Update active state in list
        document.querySelectorAll('.note-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === noteId);
        });

        this.saveStatus.textContent = 'Saved';
        this.saveStatus.className = 'save-status saved';
    }

    scheduleAutoSave() {
        this.saveStatus.textContent = 'Saving...';
        this.saveStatus.className = 'save-status saving';

        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this.saveCurrentNote();
        }, 500);
    }

    saveCurrentNote() {
        if (!this.currentNoteId) return;

        const note = this.notes.find(n => n.id === this.currentNoteId);
        if (!note) return;

        note.title = this.noteTitle.value || 'Untitled Note';
        note.content = this.noteContent.value;
        note.updatedAt = Date.now();

        // Move to top of list
        const index = this.notes.findIndex(n => n.id === this.currentNoteId);
        if (index > 0) {
            this.notes.splice(index, 1);
            this.notes.unshift(note);
        }

        this.saveNotes();
        this.renderNotesList();

        this.saveStatus.textContent = 'Saved';
        this.saveStatus.className = 'save-status saved';
    }

    deleteNote() {
        if (!this.currentNoteId) return;

        if (!confirm('Delete this note?')) return;

        const index = this.notes.findIndex(n => n.id === this.currentNoteId);
        if (index !== -1) {
            this.notes.splice(index, 1);
            this.saveNotes();
        }

        if (this.notes.length === 0) {
            this.createNewNote();
        } else {
            this.renderNotesList();
            this.loadNote(this.notes[0].id);
        }

        this.showToast('Note deleted');
    }

    downloadNote() {
        const title = this.noteTitle.value || 'Untitled Note';
        const content = this.noteContent.value;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast('Note downloaded');
    }

    copyNote() {
        const content = this.noteContent.value;
        if (!content) {
            this.showToast('Nothing to copy');
            return;
        }

        navigator.clipboard.writeText(content).then(() => {
            this.showToast('Copied to clipboard');
        }).catch(() => {
            this.showToast('Failed to copy');
        });
    }

    updateCounts() {
        const content = this.noteContent.value;
        const chars = content.length;
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;

        this.charCount.textContent = `${chars.toLocaleString()} character${chars !== 1 ? 's' : ''}`;
        this.wordCount.textContent = `${words.toLocaleString()} word${words !== 1 ? 's' : ''}`;
    }

    renderNotesList() {
        if (this.notes.length === 0) {
            this.notesList.innerHTML = `
                <div class="empty-notes">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <p>No notes yet</p>
                    <p>Click + to create one</p>
                </div>
            `;
            return;
        }

        this.notesList.innerHTML = this.notes.map(note => {
            const preview = note.content.substring(0, 50).replace(/\n/g, ' ') || 'Empty note';
            const date = this.formatDate(note.updatedAt);

            return `
                <div class="note-item ${note.id === this.currentNoteId ? 'active' : ''}" data-id="${note.id}">
                    <div class="note-item-title">${this.escapeHtml(note.title)}</div>
                    <div class="note-item-preview">${this.escapeHtml(preview)}</div>
                    <div class="note-item-date">${date}</div>
                </div>
            `;
        }).join('');

        // Add click handlers
        this.notesList.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', () => {
                this.loadNote(item.dataset.id);
                this.closeMobileSidebar();
            });
        });
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.add('show');
        setTimeout(() => this.toast.classList.remove('show'), 3000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new NotePad();
});
