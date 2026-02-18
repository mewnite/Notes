/**
 * Notes Sync - Main Application Logic
 * Enhanced with file upload/download support
 */

(function() {
    'use strict';

    // ====================
    // State
    // ====================
    const state = {
        notes: [],
        files: [],
        currentNote: null,
        filter: {
            subject: 'all',
            search: '',
            sort: 'modifiedAt'
        },
        subjects: [],
        isSyncing: false,
        isSaving: false,
        autoSaveTimeout: null
    };

    // ====================
    // DOM Elements
    // ====================
    const elements = {
        app: document.getElementById('app'),
        sidebar: document.getElementById('sidebar'),
        notesView: document.getElementById('notesView'),
        editorView: document.getElementById('editorView'),
        
        // Sidebar
        sidebarToggle: document.getElementById('sidebarToggle'),
        newNoteBtn: document.getElementById('newNoteBtn'),
        searchInput: document.getElementById('searchInput'),
        subjectList: document.getElementById('subjectList'),
        filesList: document.getElementById('filesList'),
        totalCount: document.getElementById('totalCount'),
        syncStatus: document.getElementById('syncStatus'),
        syncBtn: document.getElementById('syncBtn'),
        settingsBtn: document.getElementById('settingsBtn'),
        fileInput: document.getElementById('fileInput'),
        
        // Notes List
        notesGrid: document.getElementById('notesGrid'),
        notesCount: document.getElementById('notesCount'),
        emptyState: document.getElementById('emptyState'),
        loadingState: document.getElementById('loadingState'),
        sortSelect: document.getElementById('sortSelect'),
        
        // Editor
        backBtn: document.getElementById('backBtn'),
        deleteNoteBtn: document.getElementById('deleteNoteBtn'),
        saveStatus: document.getElementById('saveStatus'),
        noteTitle: document.getElementById('noteTitle'),
        noteSubject: document.getElementById('noteSubject'),
        noteTags: document.getElementById('noteTags'),
        noteContent: document.getElementById('noteContent'),
        subjectsList: document.getElementById('subjectsList'),
        wordCount: document.getElementById('wordCount'),
        charCount: document.getElementById('charCount'),
        
        // Modals
        authModal: document.getElementById('authModal'),
        closeAuthModal: document.getElementById('closeAuthModal'),
        githubToken: document.getElementById('githubToken'),
        authError: document.getElementById('authError'),
        authErrorText: document.getElementById('authErrorText'),
        connectBtn: document.getElementById('connectBtn'),
        
        deleteModal: document.getElementById('deleteModal'),
        closeDeleteModal: document.getElementById('closeDeleteModal'),
        cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
        confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
        
        // Toast
        toastContainer: document.getElementById('toastContainer')
    };

    // ====================
    // Utilities
    // ====================
    function generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function formatDate(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Hace un momento';
        if (diff < 3600000) {
            const minutes = Math.floor(diff / 60000);
            return `Hace ${minutes}m`;
        }
        if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            return `Hace ${hours}h`;
        }
        if (date.getFullYear() === now.getFullYear()) {
            return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        }
        return date.toLocaleDateString('es-ES', { year: 'numeric', day: 'numeric', month: 'short' });
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ====================
    // Toast Notifications
    // ====================
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
        };
        
        toast.innerHTML = `${icons[type]}<span>${message}</span>`;
        elements.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideIn 200ms ease-out reverse';
            setTimeout(() => toast.remove(), 200);
        }, 3500);
    }

    // ====================
    // Data Management
    // ====================
    async function loadNotes() {
        try {
            showLoading(true);
            updateSyncStatus('syncing');
            
            const data = await GistManager.readNotes();
            state.notes = data.notes || [];
            state.files = data.files || [];
            
            localStorage.setItem('notes_sync_local_notes', JSON.stringify(state.notes));
            localStorage.setItem('notes_sync_local_files', JSON.stringify(state.files));
            
            updateSyncStatus('synced');
            showToast('Sincronizado correctamente', 'success');
        } catch (error) {
            console.error('Error loading notes:', error);
            
            const cachedNotes = localStorage.getItem('notes_sync_local_notes');
            const cachedFiles = localStorage.getItem('notes_sync_local_files');
            
            if (cachedNotes) state.notes = JSON.parse(cachedNotes);
            if (cachedFiles) state.files = JSON.parse(cachedFiles);
            
            if (cachedNotes || cachedFiles) {
                updateSyncStatus('error');
                showToast('Sin conexión - modo offline', 'info');
            } else {
                state.notes = [];
                state.files = [];
                showToast('Error al cargar datos', 'error');
            }
        } finally {
            showLoading(false);
            extractSubjects();
            renderNotes();
            renderSubjects();
            renderFiles();
        }
    }

    async function saveNotes() {
        if (state.isSaving) return;
        
        try {
            state.isSaving = true;
            updateSaveStatus('saving');
            
            const data = {
                version: '2.0',
                lastSync: new Date().toISOString(),
                notes: state.notes,
                files: state.files
            };
            
            await GistManager.writeNotes(data);
            
            updateSaveStatus('saved');
            localStorage.setItem('notes_sync_local_notes', JSON.stringify(state.notes));
            localStorage.setItem('notes_sync_local_files', JSON.stringify(state.files));
            
            setTimeout(() => updateSaveStatus(''), 2000);
        } catch (error) {
            console.error('Error saving notes:', error);
            updateSaveStatus('error');
            showToast('Error al guardar', 'error');
        } finally {
            state.isSaving = false;
        }
    }

    const debouncedSave = debounce(saveNotes, 1000);

    function extractSubjects() {
        const subjects = new Set();
        state.notes.forEach(note => {
            if (note.subject && note.subject.trim()) {
                subjects.add(note.subject.trim());
            }
        });
        state.subjects = Array.from(subjects).sort();
    }

    function getFilteredNotes() {
        let filtered = [...state.notes];
        
        if (state.filter.subject !== 'all') {
            filtered = filtered.filter(note => note.subject === state.filter.subject);
        }
        
        if (state.filter.search) {
            const search = state.filter.search.toLowerCase();
            filtered = filtered.filter(note =>
                note.title.toLowerCase().includes(search) ||
                note.content.toLowerCase().includes(search) ||
                (note.tags && note.tags.some(tag => tag.toLowerCase().includes(search)))
            );
        }
        
        filtered.sort((a, b) => {
            switch (state.filter.sort) {
                case 'title': return a.title.localeCompare(b.title);
                case 'subject': return (a.subject || '').localeCompare(b.subject || '');
                case 'createdAt': return new Date(b.createdAt) - new Date(a.createdAt);
                case 'modifiedAt': default: return new Date(b.modifiedAt) - new Date(a.modifiedAt);
            }
        });
        
        return filtered;
    }

    // ====================
    // File Handling
    // ====================
    async function handleFileUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        for (const file of files) {
            try {
                const content = await readFileContent(file);
                const fileData = {
                    id: generateId(),
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    content: content,
                    uploadedAt: new Date().toISOString()
                };
                
                state.files.push(fileData);
                showToast(`${file.name} subido correctamente`, 'success');
            } catch (error) {
                console.error('Error uploading file:', error);
                showToast(`Error al subir ${file.name}`, 'error');
            }
        }
        
        debouncedSave();
        renderFiles();
        event.target.value = '';
    }

    function readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            if (file.type === 'application/pdf') {
                // For PDFs, store as base64
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            } else {
                // For text files
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsText(file);
            }
        });
    }

    function downloadFile(fileId) {
        const file = state.files.find(f => f.id === fileId);
        if (!file) return;

        const blob = new Blob([file.content], { type: file.type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast(`Descargando ${file.name}`, 'info');
    }

    function exportNote(noteId) {
        const note = state.notes.find(n => n.id === noteId);
        if (!note) return;

        const content = `# ${note.title || 'Sin título'}
${note.subject ? `**Materia:** ${note.subject}\n` : ''}${note.tags && note.tags.length ? `**Etiquetas:** ${note.tags.join(', ')}\n` : ''}
---

${note.content || ''}`;

        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${note.title || 'nota'}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast(`Exportando ${note.title || 'nota'}`, 'info');
    }

    function deleteFile(fileId) {
        const index = state.files.findIndex(f => f.id === fileId);
        if (index > -1) {
            const fileName = state.files[index].name;
            state.files.splice(index, 1);
            debouncedSave();
            renderFiles();
            showToast(`${fileName} eliminado`, 'success');
        }
    }

    // ====================
    // UI Updates
    // ====================
    function showLoading(show) {
        elements.loadingState.classList.toggle('visible', show);
    }

    function showEmptyState(show) {
        elements.emptyState.classList.toggle('visible', show && state.notes.length === 0 && state.files.length === 0);
    }

    function updateSyncStatus(status) {
        elements.syncStatus.className = 'sync-status ' + status;
        const texts = {
            '': 'Listo',
            syncing: 'Sincronizando...',
            synced: 'Sincronizado',
            error: 'Sin conexión'
        };
        elements.syncStatus.querySelector('.sync-text').textContent = texts[status] || texts[''];
    }

    function updateSaveStatus(status) {
        elements.saveStatus.className = 'save-status ' + status;
        const texts = { '': '', saving: 'Guardando...', saved: 'Guardado', error: 'Error' };
        elements.saveStatus.textContent = texts[status] || '';
    }

    function renderNotes() {
        const filtered = getFilteredNotes();
        
        elements.notesCount.textContent = `${state.notes.length} nota${state.notes.length !== 1 ? 's' : ''}`;
        
        if (filtered.length === 0 && state.notes.length === 0) {
            showEmptyState(true);
            elements.notesGrid.innerHTML = '';
            return;
        }
        
        showEmptyState(false);
        
        elements.notesGrid.innerHTML = filtered.map(note => `
            <div class="note-card" data-id="${note.id}">
                <h3 class="note-card-title">${escapeHtml(note.title || 'Sin título')}</h3>
                ${note.subject ? `<span class="note-card-subject">${escapeHtml(note.subject)}</span>` : ''}
                <p class="note-card-preview">${escapeHtml(note.content || 'Sin contenido')}</p>
                <div class="note-card-footer">
                    <span class="note-card-date">${formatDate(note.modifiedAt)}</span>
                    <button class="note-download" onclick="event.stopPropagation(); exportNote('${note.id}')" title="Exportar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
        
        document.querySelectorAll('.note-card').forEach(card => {
            card.addEventListener('click', () => openNote(card.dataset.id));
        });
    }

    function renderSubjects() {
        const subjectCounts = {};
        state.notes.forEach(note => {
            if (note.subject) subjectCounts[note.subject] = (subjectCounts[note.subject] || 0) + 1;
        });
        
        let html = `
            <li class="subject-item ${state.filter.subject === 'all' ? 'active' : ''}" data-subject="all">
                <span class="subject-dot"></span>
                <span class="subject-name">Todas</span>
                <span class="subject-count">${state.notes.length}</span>
            </li>
        `;
        
        state.subjects.forEach(subject => {
            html += `
                <li class="subject-item ${state.filter.subject === subject ? 'active' : ''}" data-subject="${escapeHtml(subject)}">
                    <span class="subject-dot"></span>
                    <span class="subject-name">${escapeHtml(subject)}</span>
                    <span class="subject-count">${subjectCounts[subject] || 0}</span>
                </li>
            `;
        });
        
        elements.subjectList.innerHTML = html;
        elements.totalCount.textContent = state.notes.length;
        
        // Update datalist for subject autocomplete
        if (elements.subjectsList) {
            elements.subjectsList.innerHTML = state.subjects.map(s => `<option value="${escapeHtml(s)}">`).join('');
        }
        
        document.querySelectorAll('.subject-item').forEach(item => {
            item.addEventListener('click', () => {
                state.filter.subject = item.dataset.subject;
                document.querySelectorAll('.subject-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                renderNotes();
            });
        });
    }

    function renderFiles() {
        if (state.files.length === 0) {
            elements.filesList.innerHTML = '<li style="padding: 12px; color: var(--text-muted); font-size: 13px;">No hay archivos</li>';
            return;
        }
        
        elements.filesList.innerHTML = state.files.map(file => `
            <li class="file-item" data-id="${file.id}" title="${escapeHtml(file.name)}">
                <div class="file-icon ${file.type === 'application/pdf' ? 'pdf' : ''}">
                    ${file.type === 'application/pdf' 
                        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>'
                        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>'
                    }
                </div>
                <div class="file-info">
                    <div class="file-name">${escapeHtml(file.name)}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
                <button class="file-download" onclick="event.stopPropagation(); downloadFile('${file.id}')" title="Descargar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                </button>
            </li>
        `).join('');
    }

    // ====================
    // Note Operations
    // ====================
    function createNewNote() {
        const now = new Date().toISOString();
        
        state.currentNote = {
            id: generateId(),
            title: '',
            subject: '',
            tags: [],
            content: '',
            createdAt: now,
            modifiedAt: now
        };
        
        state.notes.unshift(state.currentNote);
        
        openEditor();
        renderNotes();
        renderSubjects();
    }

    function openNote(noteId) {
        const note = state.notes.find(n => n.id === noteId);
        if (note) {
            state.currentNote = note;
            openEditor();
        }
    }

    function openEditor() {
        elements.notesView.classList.add('hidden');
        elements.editorView.classList.remove('hidden');
        
        elements.noteTitle.value = state.currentNote.title || '';
        elements.noteSubject.value = state.currentNote.subject || '';
        elements.noteTags.value = (state.currentNote.tags || []).join(', ');
        elements.noteContent.value = state.currentNote.content || '';
        
        updateWordCount();
        elements.noteTitle.focus();
    }

    function closeEditor() {
        elements.editorView.classList.add('hidden');
        elements.notesView.classList.remove('hidden');
        state.currentNote = null;
    }

    function updateCurrentNote() {
        if (!state.currentNote) return;
        
        state.currentNote.title = elements.noteTitle.value.trim();
        state.currentNote.subject = elements.noteSubject.value.trim();
        state.currentNote.content = elements.noteContent.value;
        
        const tagsStr = elements.noteTags.value;
        state.currentNote.tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];
        
        state.currentNote.modifiedAt = new Date().toISOString();
        
        updateWordCount();
        debouncedSave();
    }

    function updateWordCount() {
        const content = elements.noteContent.value;
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        const chars = content.length;
        
        elements.wordCount.textContent = `${words} palabra${words !== 1 ? 's' : ''}`;
        elements.charCount.textContent = `${chars} caracter${chars !== 1 ? 'es' : ''}`;
    }

    function deleteCurrentNote() {
        if (!state.currentNote) return;
        
        const index = state.notes.findIndex(n => n.id === state.currentNote.id);
        if (index > -1) {
            state.notes.splice(index, 1);
            saveNotes();
            closeEditor();
            renderNotes();
            renderSubjects();
            showToast('Nota eliminada', 'success');
        }
    }

    // ====================
    // Event Handlers
    // ====================
    function setupEventListeners() {
        // Sidebar toggle - works for both mobile (drawer) and desktop (collapse)
        elements.sidebarToggle.addEventListener('click', () => {
            const isMobile = window.innerWidth <= 900;
            
            if (isMobile) {
                // Mobile: open/close drawer
                elements.sidebar.classList.toggle('open');
            } else {
                // Desktop: collapse/expand
                elements.sidebar.classList.toggle('collapsed');
                elements.app.classList.toggle('sidebar-collapsed');
            }
        });
        
        // Close mobile sidebar when clicking outside
        document.addEventListener('click', (e) => {
            const isMobile = window.innerWidth <= 900;
            if (isMobile && elements.sidebar.classList.contains('open')) {
                if (!elements.sidebar.contains(e.target) && !elements.sidebarToggle.contains(e.target)) {
                    elements.sidebar.classList.remove('open');
                }
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            const isMobile = window.innerWidth <= 900;
            if (!isMobile) {
                elements.sidebar.classList.remove('open');
            }
        });
        
        // New note
        elements.newNoteBtn.addEventListener('click', createNewNote);
        
        // File upload
        elements.fileInput.addEventListener('change', handleFileUpload);
        
        // Drag and drop
        const uploadZone = document.getElementById('uploadZone');
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = 'var(--accent-primary)';
        });
        uploadZone.addEventListener('dragleave', () => {
            uploadZone.style.borderColor = '';
        });
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = '';
            elements.fileInput.files = e.dataTransfer.files;
            handleFileUpload({ target: elements.fileInput });
        });
        
        // Search
        elements.searchInput.addEventListener('input', debounce((e) => {
            state.filter.search = e.target.value;
            renderNotes();
        }, 300));
        
        // Sort
        elements.sortSelect.addEventListener('change', (e) => {
            state.filter.sort = e.target.value;
            renderNotes();
        });
        
        // Editor inputs
        elements.noteTitle.addEventListener('input', updateCurrentNote);
        elements.noteSubject.addEventListener('input', updateCurrentNote);
        elements.noteTags.addEventListener('input', updateCurrentNote);
        elements.noteContent.addEventListener('input', updateCurrentNote);
        
        // Editor navigation
        elements.backBtn.addEventListener('click', () => {
            closeEditor();
            renderNotes();
        });
        
        // Delete note
        elements.deleteNoteBtn.addEventListener('click', () => {
            elements.deleteModal.classList.remove('hidden');
        });
        
        elements.closeDeleteModal.addEventListener('click', () => {
            elements.deleteModal.classList.add('hidden');
        });
        
        elements.cancelDeleteBtn.addEventListener('click', () => {
            elements.deleteModal.classList.add('hidden');
        });
        
        elements.confirmDeleteBtn.addEventListener('click', () => {
            elements.deleteModal.classList.add('hidden');
            deleteCurrentNote();
        });
        
        // Sync
        elements.syncBtn.addEventListener('click', loadNotes);
        
        // Settings - Account
        elements.settingsBtn.addEventListener('click', () => {
            if (confirm('¿Cerrar sesión de GitHub?')) {
                GistManager.logout();
                localStorage.removeItem('notes_sync_local_notes');
                localStorage.removeItem('notes_sync_local_files');
                showAuthModal();
            }
        });
        
        // Auth modal
        elements.closeAuthModal.addEventListener('click', () => {
            elements.authModal.classList.add('hidden');
        });
        
        elements.connectBtn.addEventListener('click', handleAuth);
        
        // Click outside modals
        elements.authModal.addEventListener('click', (e) => {
            if (e.target === elements.authModal) elements.authModal.classList.add('hidden');
        });
        
        elements.deleteModal.addEventListener('click', (e) => {
            if (e.target === elements.deleteModal) elements.deleteModal.classList.add('hidden');
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                if (!elements.editorView.classList.contains('hidden')) return;
                createNewNote();
            }
            
            if (e.key === 'Escape' && !elements.editorView.classList.contains('hidden')) {
                closeEditor();
                renderNotes();
            }
        });
    }

    async function handleAuth() {
        const token = elements.githubToken.value.trim();
        
        if (!token) {
            showAuthError('Por favor ingresa un token');
            return;
        }
        
        elements.connectBtn.disabled = true;
        elements.connectBtn.textContent = 'Validando...';
        
        try {
            await GistManager.validateToken(token);
            GistManager.setToken(token);
            
            elements.authModal.classList.add('hidden');
            elements.githubToken.value = '';
            elements.authError.classList.add('hidden');
            
            showToast('Conectado a GitHub', 'success');
            await loadNotes();
        } catch (error) {
            showAuthError(error.message);
        } finally {
            elements.connectBtn.disabled = false;
            elements.connectBtn.textContent = 'Conectar';
        }
    }

    function showAuthError(message) {
        elements.authError.classList.remove('hidden');
        elements.authErrorText.textContent = message;
    }

    function showAuthModal() {
        elements.authModal.classList.remove('hidden');
        elements.githubToken.focus();
    }

    // ====================
    // Initialization
    // ====================
    async function init() {
        GistManager.init();
        setupEventListeners();
        
        // Make functions globally available
        window.downloadFile = downloadFile;
        window.exportNote = exportNote;
        
        if (!GistManager.isAuthenticated()) {
            showAuthModal();
            return;
        }
        
        await loadNotes();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
