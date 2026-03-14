// Sticky Board JavaScript

class StickyBoard {
    constructor() {
        this.notes = [];
        this.nextNoteId = 1;
        this.editingNoteId = null;
        this.isViewOnly = false;
        this.boardId = null;
        this.dragState = null;
        this.resizeState = null;
        this.zoom = 1;
        this.minZoom = 0.25;
        this.maxZoom = 2;
        this.zoomStep = 0.25;

        this.initElements();
        this.checkViewMode();
        this.bindEvents();
    }

    initElements() {
        // Board
        this.board = document.getElementById('board');
        this.boardContainer = document.getElementById('boardContainer');

        // Header actions
        this.headerActions = document.getElementById('headerActions');
        this.addNoteBtn = document.getElementById('addNoteBtn');
        this.clearBoardBtn = document.getElementById('clearBoardBtn');
        this.shareBtn = document.getElementById('shareBtn');
        this.viewOnlyBanner = document.getElementById('viewOnlyBanner');
        this.boardControls = document.getElementById('boardControls');

        // Zoom controls
        this.zoomInBtn = document.getElementById('zoomInBtn');
        this.zoomOutBtn = document.getElementById('zoomOutBtn');
        this.zoomResetBtn = document.getElementById('zoomResetBtn');
        this.zoomLevelDisplay = document.getElementById('zoomLevel');

        // Note editor modal
        this.noteEditorModal = document.getElementById('noteEditorModal');
        this.editorTitle = document.getElementById('editorTitle');
        this.closeEditorBtn = document.getElementById('closeEditorBtn');
        this.noteText = document.getElementById('noteText');
        this.colorPicker = document.getElementById('colorPicker');
        this.fontPicker = document.getElementById('fontPicker');
        this.fontSizePicker = document.getElementById('fontSizePicker');
        this.deleteNoteBtn = document.getElementById('deleteNoteBtn');
        this.saveNoteBtn = document.getElementById('saveNoteBtn');

        // Share modal
        this.shareModal = document.getElementById('shareModal');
        this.closeShareBtn = document.getElementById('closeShareBtn');
        this.shareLink = document.getElementById('shareLink');
        this.copyLinkBtn = document.getElementById('copyLinkBtn');
        this.shortenLinkBtn = document.getElementById('shortenLinkBtn');

        // Toast
        this.toast = document.getElementById('toast');
    }

    async checkViewMode() {
        // Check for server-stored board ID in URL path
        const pathMatch = window.location.pathname.match(/\/apps\/sticky-board\/b\/([a-z0-9]+)/);

        if (pathMatch) {
            // Load from server
            this.boardId = pathMatch[1];
            await this.loadFromServer(this.boardId);
            this.isViewOnly = true;
            this.enableViewOnlyMode();
        } else {
            // Check for legacy compressed data in URL
            const urlParams = new URLSearchParams(window.location.search);
            const data = urlParams.get('board');

            if (data) {
                try {
                    const decoded = LZString.decompressFromEncodedURIComponent(data);
                    const boardData = JSON.parse(decoded);
                    this.notes = boardData.notes || [];
                    this.nextNoteId = boardData.nextId || 1;
                    this.isViewOnly = true;
                    this.enableViewOnlyMode();
                } catch (e) {
                    console.error('Error loading shared board:', e);
                    this.loadFromStorage();
                }
            } else {
                this.loadFromStorage();
            }
        }

        this.renderNotes();
    }

    async loadFromServer(boardId) {
        try {
            const res = await fetch(`/api/sticky-board/${boardId}`);
            if (!res.ok) throw new Error('Board not found');

            const data = await res.json();
            this.notes = data.notes || [];
            this.nextNoteId = Math.max(...this.notes.map(n => n.id), 0) + 1;
        } catch (e) {
            console.error('Error loading board from server:', e);
            this.showToast('Board not found');
        }
    }

    enableViewOnlyMode() {
        document.body.classList.add('view-mode');
        if (this.boardControls) {
            this.boardControls.querySelector('.controls-right').style.display = 'none';
        }
        if (this.viewOnlyBanner) {
            this.viewOnlyBanner.style.display = 'flex';
        }
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem('stickyBoard');
            if (saved) {
                const data = JSON.parse(saved);
                this.notes = data.notes || [];
                this.nextNoteId = data.nextId || 1;
            }
        } catch (e) {
            console.error('Error loading from storage:', e);
        }
    }

    saveToStorage() {
        if (this.isViewOnly) return;

        try {
            localStorage.setItem('stickyBoard', JSON.stringify({
                notes: this.notes,
                nextId: this.nextNoteId
            }));
        } catch (e) {
            console.error('Error saving to storage:', e);
        }
    }

    bindEvents() {
        // Add note
        if (this.addNoteBtn) {
            this.addNoteBtn.addEventListener('click', () => this.createNote());
        }

        // Clear board
        if (this.clearBoardBtn) {
            this.clearBoardBtn.addEventListener('click', () => this.clearBoard());
        }

        // Share
        if (this.shareBtn) {
            this.shareBtn.addEventListener('click', () => this.openShareModal());
        }
        if (this.closeShareBtn) {
            this.closeShareBtn.addEventListener('click', () => this.closeShareModal());
        }
        if (this.copyLinkBtn) {
            this.copyLinkBtn.addEventListener('click', () => this.copyShareLink());
        }
        if (this.shortenLinkBtn) {
            this.shortenLinkBtn.addEventListener('click', () => this.createShortLink());
        }

        // Note editor
        if (this.closeEditorBtn) {
            this.closeEditorBtn.addEventListener('click', () => this.closeEditor());
        }
        if (this.saveNoteBtn) {
            this.saveNoteBtn.addEventListener('click', () => this.saveNote());
        }
        if (this.deleteNoteBtn) {
            this.deleteNoteBtn.addEventListener('click', () => this.deleteNote());
        }

        // Color picker
        if (this.colorPicker) {
            this.colorPicker.querySelectorAll('.color-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.colorPicker.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });
        }

        // Close modals on overlay click
        if (this.noteEditorModal) {
            this.noteEditorModal.addEventListener('click', (e) => {
                if (e.target === this.noteEditorModal) this.closeEditor();
            });
        }
        if (this.shareModal) {
            this.shareModal.addEventListener('click', (e) => {
                if (e.target === this.shareModal) this.closeShareModal();
            });
        }

        // Global mouse events for drag/resize
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', () => this.handleMouseUp());
        document.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        document.addEventListener('touchend', () => this.handleMouseUp());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeEditor();
                this.closeShareModal();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !this.isViewOnly) {
                e.preventDefault();
                this.createNote();
            }
            // Zoom shortcuts
            if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
                e.preventDefault();
                this.zoomIn();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === '-') {
                e.preventDefault();
                this.zoomOut();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === '0') {
                e.preventDefault();
                this.resetZoom();
            }
        });

        // Zoom controls
        if (this.zoomInBtn) {
            this.zoomInBtn.addEventListener('click', () => this.zoomIn());
        }
        if (this.zoomOutBtn) {
            this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
        }
        if (this.zoomResetBtn) {
            this.zoomResetBtn.addEventListener('click', () => this.resetZoom());
        }

        // Mouse wheel zoom
        if (this.boardContainer) {
            this.boardContainer.addEventListener('wheel', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (e.deltaY < 0) {
                        this.zoomIn();
                    } else {
                        this.zoomOut();
                    }
                }
            }, { passive: false });
        }

        // Pinch to zoom (touch devices)
        let lastTouchDistance = 0;
        if (this.boardContainer) {
            this.boardContainer.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    lastTouchDistance = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                }
            });

            this.boardContainer.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2) {
                    const distance = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );

                    if (lastTouchDistance > 0) {
                        const delta = distance - lastTouchDistance;
                        if (Math.abs(delta) > 10) {
                            if (delta > 0) {
                                this.zoomIn(0.1);
                            } else {
                                this.zoomOut(0.1);
                            }
                            lastTouchDistance = distance;
                        }
                    }
                }
            });

            this.boardContainer.addEventListener('touchend', () => {
                lastTouchDistance = 0;
            });
        }
    }

    // Zoom methods
    zoomIn(step = this.zoomStep) {
        this.setZoom(Math.min(this.maxZoom, this.zoom + step));
    }

    zoomOut(step = this.zoomStep) {
        this.setZoom(Math.max(this.minZoom, this.zoom - step));
    }

    resetZoom() {
        this.setZoom(1);
    }

    setZoom(level) {
        this.zoom = level;
        if (this.board) {
            this.board.style.transform = `scale(${this.zoom})`;
        }
        if (this.zoomLevelDisplay) {
            this.zoomLevelDisplay.textContent = `${Math.round(this.zoom * 100)}%`;
        }
    }

    createNote() {
        if (this.isViewOnly) return;

        // Position note within the visible area of the board
        const containerRect = this.boardContainer.getBoundingClientRect();
        const scrollLeft = this.boardContainer.scrollLeft;
        const scrollTop = this.boardContainer.scrollTop;
        const visibleWidth = containerRect.width / this.zoom;
        const visibleHeight = containerRect.height / this.zoom;

        const note = {
            id: this.nextNoteId++,
            text: 'New note...',
            color: '#fff740',
            font: 'Poppins',
            fontSize: 14,
            x: (scrollLeft / this.zoom) + Math.random() * Math.max(visibleWidth - 250, 50) + 25,
            y: (scrollTop / this.zoom) + Math.random() * Math.max(visibleHeight - 250, 50) + 25,
            width: 200,
            height: 200,
            zIndex: this.getMaxZIndex() + 1
        };

        this.notes.push(note);
        this.renderNote(note);
        this.saveToStorage();
        this.openEditor(note.id);
    }

    renderNotes() {
        this.board.innerHTML = '';
        this.notes.forEach(note => this.renderNote(note));
    }

    renderNote(note) {
        const el = document.createElement('div');
        el.className = 'sticky-note';
        el.dataset.id = note.id;
        el.style.cssText = `
            left: ${note.x}px;
            top: ${note.y}px;
            width: ${note.width}px;
            height: ${note.height}px;
            background: ${note.color};
            z-index: ${note.zIndex};
        `;

        el.innerHTML = `
            <div class="note-header">
                ${!this.isViewOnly ? `
                    <button class="note-edit-btn" title="Edit note">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                ` : ''}
            </div>
            <div class="note-content" style="font-family: '${note.font}', sans-serif; font-size: ${note.fontSize}px;">${this.escapeHtml(note.text)}</div>
            ${!this.isViewOnly ? '<div class="resize-handle"></div>' : ''}
        `;

        this.board.appendChild(el);

        // Bind events
        if (!this.isViewOnly) {
            const editBtn = el.querySelector('.note-edit-btn');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openEditor(note.id);
                });
            }

            // Drag
            el.addEventListener('mousedown', (e) => this.startDrag(e, note));
            el.addEventListener('touchstart', (e) => this.startDrag(e, note), { passive: false });

            // Resize
            const resizeHandle = el.querySelector('.resize-handle');
            if (resizeHandle) {
                resizeHandle.addEventListener('mousedown', (e) => this.startResize(e, note));
                resizeHandle.addEventListener('touchstart', (e) => this.startResize(e, note), { passive: false });
            }

            // Double click to edit
            el.addEventListener('dblclick', () => this.openEditor(note.id));
        }
    }

    startDrag(e, note) {
        if (this.isViewOnly) return;
        if (e.target.closest('.note-edit-btn') || e.target.closest('.resize-handle')) return;

        e.preventDefault();
        const el = this.board.querySelector(`[data-id="${note.id}"]`);
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        // Bring to front
        note.zIndex = this.getMaxZIndex() + 1;
        el.style.zIndex = note.zIndex;

        this.dragState = {
            note,
            el,
            startX: clientX,
            startY: clientY,
            origX: note.x,
            origY: note.y
        };

        el.classList.add('dragging');
    }

    startResize(e, note) {
        if (this.isViewOnly) return;
        e.preventDefault();
        e.stopPropagation();

        const el = this.board.querySelector(`[data-id="${note.id}"]`);
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        this.resizeState = {
            note,
            el,
            startX: clientX,
            startY: clientY,
            origWidth: note.width,
            origHeight: note.height
        };
    }

    handleMouseMove(e) {
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        if (this.dragState) {
            const { note, el, startX, startY, origX, origY } = this.dragState;
            // Divide delta by zoom so screen-space movement maps correctly to board-space
            const deltaX = (clientX - startX) / this.zoom;
            const deltaY = (clientY - startY) / this.zoom;

            // Use actual board dimensions (unscaled) for boundary constraints
            const boardWidth = this.board.offsetWidth;
            const boardHeight = this.board.offsetHeight;
            const newX = Math.max(0, Math.min(boardWidth - note.width, origX + deltaX));
            const newY = Math.max(0, Math.min(boardHeight - note.height, origY + deltaY));

            note.x = newX;
            note.y = newY;
            el.style.left = newX + 'px';
            el.style.top = newY + 'px';
        }

        if (this.resizeState) {
            const { note, el, startX, startY, origWidth, origHeight } = this.resizeState;
            // Divide delta by zoom for correct resize at any zoom level
            const deltaX = (clientX - startX) / this.zoom;
            const deltaY = (clientY - startY) / this.zoom;

            const newWidth = Math.max(150, origWidth + deltaX);
            const newHeight = Math.max(150, origHeight + deltaY);

            note.width = newWidth;
            note.height = newHeight;
            el.style.width = newWidth + 'px';
            el.style.height = newHeight + 'px';
        }
    }

    handleTouchMove(e) {
        if (this.dragState || this.resizeState) {
            e.preventDefault();
        }
        this.handleMouseMove(e);
    }

    handleMouseUp() {
        if (this.dragState) {
            this.dragState.el.classList.remove('dragging');
            this.dragState = null;
            this.saveToStorage();
        }

        if (this.resizeState) {
            this.resizeState = null;
            this.saveToStorage();
        }
    }

    getMaxZIndex() {
        return Math.max(0, ...this.notes.map(n => n.zIndex || 0));
    }

    openEditor(noteId) {
        if (this.isViewOnly) return;

        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        this.editingNoteId = noteId;
        this.editorTitle.textContent = 'Edit Note';
        this.noteText.value = note.text;
        this.fontPicker.value = note.font;
        this.fontSizePicker.value = note.fontSize;

        // Set active color
        this.colorPicker.querySelectorAll('.color-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === note.color);
        });

        this.noteEditorModal.style.display = 'flex';
        this.noteText.focus();
    }

    closeEditor() {
        if (this.noteEditorModal) {
            this.noteEditorModal.style.display = 'none';
        }
        this.editingNoteId = null;
    }

    saveNote() {
        if (!this.editingNoteId) return;

        const note = this.notes.find(n => n.id === this.editingNoteId);
        if (!note) return;

        const activeColor = this.colorPicker.querySelector('.color-btn.active');

        note.text = this.noteText.value;
        note.color = activeColor ? activeColor.dataset.color : note.color;
        note.font = this.fontPicker.value;
        note.fontSize = parseInt(this.fontSizePicker.value);

        // Update DOM
        const el = this.board.querySelector(`[data-id="${note.id}"]`);
        if (el) {
            el.style.background = note.color;
            const content = el.querySelector('.note-content');
            content.textContent = note.text;
            content.style.fontFamily = `'${note.font}', sans-serif`;
            content.style.fontSize = note.fontSize + 'px';
        }

        this.saveToStorage();
        this.closeEditor();
        this.showToast('Note saved');
    }

    deleteNote() {
        if (!this.editingNoteId) return;

        if (!confirm('Delete this note?')) return;

        const el = this.board.querySelector(`[data-id="${this.editingNoteId}"]`);
        if (el) el.remove();

        this.notes = this.notes.filter(n => n.id !== this.editingNoteId);
        this.saveToStorage();
        this.closeEditor();
        this.showToast('Note deleted');
    }

    clearBoard() {
        if (this.isViewOnly) return;
        if (!confirm('Clear all notes from the board?')) return;

        this.notes = [];
        this.board.innerHTML = '';
        this.saveToStorage();
        this.showToast('Board cleared');
    }

    openShareModal() {
        // Generate compressed link (legacy/full data URL)
        const data = {
            notes: this.notes,
            nextId: this.nextNoteId
        };

        const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(data));
        const url = `${window.location.origin}/apps/sticky-board?board=${compressed}`;

        this.shareLink.value = url;
        this.shareModal.style.display = 'flex';
    }

    closeShareModal() {
        if (this.shareModal) {
            this.shareModal.style.display = 'none';
        }
    }

    copyShareLink() {
        this.shareLink.select();
        navigator.clipboard.writeText(this.shareLink.value).then(() => {
            this.showToast('Link copied to clipboard');
        }).catch(() => {
            document.execCommand('copy');
            this.showToast('Link copied');
        });
    }

    async createShortLink() {
        if (this.notes.length === 0) {
            this.showToast('Add some notes first');
            return;
        }

        this.shortenLinkBtn.classList.add('loading');
        this.shortenLinkBtn.textContent = 'Creating...';

        try {
            const res = await fetch('/api/sticky-board/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: this.notes })
            });

            const data = await res.json();

            if (data.shareUrl) {
                this.shareLink.value = data.shareUrl;
                this.showToast('Short link created!');
            } else {
                throw new Error(data.error || 'Failed to create short link');
            }
        } catch (e) {
            console.error('Error creating short link:', e);
            this.showToast('Failed to create short link');
        } finally {
            this.shortenLinkBtn.classList.remove('loading');
            this.shortenLinkBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
                Create Short Link
            `;
        }
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
    new StickyBoard();
});
