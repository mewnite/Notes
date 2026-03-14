/**
 * Notes Sync - Main Application Logic
 * Using MongoDB Atlas for storage
 * 
 * Architecture:
 * - Immediate local persistence
 * - MongoDB Atlas for cloud sync
 * - Queue-based saves
 */

(function() {
    'use strict';

    // ========================================
    // CONFIGURATION
    // ========================================
    const CONFIG = {
        AUTO_SAVE_DELAY: 500,
        SYNC_DEBOUNCE: 1000,
        MAX_FILE_SIZE: 5 * 1024 * 1024
    };

    // ========================================
    // STATE
    // ========================================
    const state = {
        notes: [],
        files: [],
        currentNote: null,
        filter: { subject: 'all', search: '', sort: 'modifiedAt' },
        subjects: [],
        isSaving: false,
        lastSaveTime: 0
    };

    // ========================================
    // DOM ELEMENTS
    // ========================================
    const elements = {};

    function initElements() {
        elements.app = document.getElementById('app');
        elements.sidebar = document.getElementById('sidebar');
        elements.notesView = document.getElementById('notesView');
        elements.editorView = document.getElementById('editorView');
        
        elements.sidebarToggle = document.getElementById('sidebarToggle');
        elements.newNoteBtn = document.getElementById('newNoteBtn');
        elements.searchInput = document.getElementById('searchInput');
        elements.subjectList = document.getElementById('subjectList');
        elements.filesList = document.getElementById('filesList');
        elements.totalCount = document.getElementById('totalCount');
        elements.syncStatus = document.getElementById('syncStatus');
        elements.syncBtn = document.getElementById('syncBtn');
        elements.settingsBtn = document.getElementById('settingsBtn');
        elements.fileInput = document.getElementById('fileInput');
        
        elements.notesGrid = document.getElementById('notesGrid');
        elements.notesCount = document.getElementById('notesCount');
        elements.emptyState = document.getElementById('emptyState');
        elements.loadingState = document.getElementById('loadingState');
        elements.sortSelect = document.getElementById('sortSelect');
        
        elements.backBtn = document.getElementById('backBtn');
        elements.saveNoteBtn = document.getElementById('saveNoteBtn');
        elements.deleteNoteBtn = document.getElementById('deleteNoteBtn');
        elements.saveStatus = document.getElementById('saveStatus');
        elements.noteTitle = document.getElementById('noteTitle');
        elements.noteSubject = document.getElementById('noteSubject');
        elements.noteTags = document.getElementById('noteTags');
        elements.noteContent = document.getElementById('noteContent');
        elements.subjectsList = document.getElementById('subjectsList');
        elements.wordCount = document.getElementById('wordCount');
        elements.charCount = document.getElementById('charCount');
        
        // MongoDB connection modal
        elements.authModal = document.getElementById('authModal');
        elements.closeAuthModal = document.getElementById('closeAuthModal');
        elements.mongoConnectForm = document.getElementById('mongoConnectForm');
        elements.connectionString = document.getElementById('connectionString');
        elements.mongoUserName = document.getElementById('mongoUserName');
        elements.connectBtn = document.getElementById('connectBtn');
        elements.authModalTitle = document.getElementById('authModalTitle');

        elements.deleteModal = document.getElementById('deleteModal');
        elements.closeDeleteModal = document.getElementById('closeDeleteModal');
        elements.cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
        elements.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
        
        elements.toastContainer = document.getElementById('toastContainer');
        
        // User info elements
        elements.userInfo = document.getElementById('userInfo');
        elements.userAvatar = document.getElementById('userAvatar');
        elements.userName = document.getElementById('userName');
        elements.userEmail = document.getElementById('userEmail');
        elements.logoutBtn = document.getElementById('logoutBtn');
    }

    // ========================================
    // UTILITIES
    // ========================================
    function generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function formatDate(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Ahora';
        if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)}m`;
        if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`;
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
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========================================
    // TOAST
    // ========================================
    function showToast(message, type = 'info') {
        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `${icons[type]}<span>${message}</span>`;
        elements.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 200);
        }, 3000);
    }

    // ========================================
    // DATA LAYER
    // ========================================
    function saveToLocalCache() {
        try {
            localStorage.setItem('notes_sync_local', JSON.stringify({
                notes: state.notes,
                files: state.files,
                lastSync: new Date().toISOString()
            }));
        } catch (e) {
            console.error('Local cache error:', e);
        }
    }

    function loadFromLocalCache() {
        try {
            const cached = localStorage.getItem('notes_sync_local');
            if (cached) {
                const data = JSON.parse(cached);
                state.notes = data.notes || [];
                state.files = data.files || [];
                return true;
            }
        } catch (e) {
            console.error('Cache load error:', e);
        }
        return false;
    }

    async function syncToMongo() {
        if (state.isSaving) return;
        
        state.isSaving = true;
        updateSaveStatus('saving');
        
        try {
            const data = {
                version: '3.0',
                lastSync: new Date().toISOString(),
                notes: state.notes,
                files: state.files
            };
            
            await MongoDBManager.writeNotes(data);
            state.lastSaveTime = Date.now();
            updateSaveStatus('saved');
            saveToLocalCache();
            
        } catch (error) {
            console.error('Sync error:', error);
            updateSaveStatus('error');
            showToast('Error al guardar: ' + error.message, 'error');
        } finally {
            state.isSaving = false;
        }
    }

    let saveTimeout = null;
    function queueSave() {
        saveToLocalCache();
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => syncToMongo(), CONFIG.SYNC_DEBOUNCE);
    }

    // ========================================
    // DATA OPERATIONS
    // ========================================
    async function loadNotes() {
        showLoading(true);
        updateSyncStatus('syncing');
        
        try {
            const data = await MongoDBManager.readNotes();
            state.notes = data.notes || [];
            state.files = data.files || [];
            
            saveToLocalCache();
            
            updateSyncStatus('synced');
            showToast('Notas cargadas desde MongoDB', 'success');
        } catch (error) {
            console.error('Load error:', error);
            
            if (!loadFromLocalCache()) {
                state.notes = [];
                state.files = [];
            }
            
            updateSyncStatus('error');
            showToast('Sin conexión - modo offline', 'info');
        } finally {
            showLoading(false);
            extractSubjects();
            renderNotes();
            renderSubjects();
            renderFiles();
        }
    }

    function saveCurrentNote() {
        if (!state.currentNote) return;
        
        state.currentNote.title = elements.noteTitle.value.trim();
        state.currentNote.subject = elements.noteSubject.value.trim();
        state.currentNote.content = elements.noteContent.value;    
        
        const tagsStr = elements.noteTags.value;
        state.currentNote.tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];
        state.currentNote.modifiedAt = new Date().toISOString();
        
        const existingIndex = state.notes.findIndex(n => n.id === state.currentNote.id);
        if (existingIndex === -1) {
            state.notes.unshift(state.currentNote);
        }
        
        updateWordCount();
        queueSave();
    }

    async function deleteNote(noteId) {
        const index = state.notes.findIndex(n => n.id === noteId);
        if (index === -1) {
            showToast('Nota no encontrada', 'error');
            return;
        }
        
        state.notes.splice(index, 1);
        saveToLocalCache();
        
        await syncToMongo();
        showToast('Nota eliminada', 'success');
    }

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
            filtered = filtered.filter(n => n.subject === state.filter.subject);
        }
        
        if (state.filter.search) {
            const search = state.filter.search.toLowerCase();
            filtered = filtered.filter(n =>
                (n.title || '').toLowerCase().includes(search) ||
                (n.content || '').toLowerCase().includes(search) ||
                (n.tags || []).some(t => t.toLowerCase().includes(search))
            );
        }
        
        filtered.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
        
        if (state.filter.sort === 'title') filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        if (state.filter.sort === 'subject') filtered.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
        if (state.filter.sort === 'createdAt') filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        return filtered;
    }

    // ========================================
    // FILE HANDLING
    // ========================================
    async function handleFileUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        for (const file of files) {
            if (file.size > CONFIG.MAX_FILE_SIZE) {
                showToast(`${file.name} muy grande (max 5MB)`, 'error');
                continue;
            }
            
            try {
                const content = await readFileContent(file);
                state.files.push({
                    id: generateId(),
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    content: content,
                    uploadedAt: new Date().toISOString()
                });
                showToast(`${file.name} subido`, 'success');
            } catch (error) {
                showToast(`Error al subir ${file.name}`, 'error');
            }
        }
        
        queueSave();
        renderFiles();
        event.target.value = '';
    }

    function readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            if (file.type === 'application/pdf') {
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            } else {
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
        a.click();
        URL.revokeObjectURL(url);
        
        showToast(`Descargando ${file.name}`, 'info');
    }

    // ========================================
    // UI RENDERING
    // ========================================
    function showLoading(show) {
        elements.loadingState.classList.toggle('visible', show);
    }

    function showEmptyState(show) {
        elements.emptyState.classList.toggle('visible', show && state.notes.length === 0);
    }

    function updateSyncStatus(status) {
        elements.syncStatus.className = 'sync-status ' + status;
        const texts = { syncing: 'Sincronizando...', synced: 'Conectado', error: 'Sin conexión', offline: 'Modo offline' };
        elements.syncStatus.querySelector('.sync-text').textContent = texts[status] || 'Listo';
    }
    
    function updateUserInfo() {
        const user = MongoDBManager.getUser();
        if (user) {
            elements.userInfo.classList.remove('hidden');
            elements.userName.textContent = user.name || user.email.split('@')[0];
            elements.userEmail.textContent = user.email;
            elements.userAvatar.textContent = (user.name || user.email.charAt(0)).toUpperCase().charAt(0);
        } else {
            elements.userInfo.classList.add('hidden');
        }
    }

    function updateSaveStatus(status) {
        elements.saveStatus.className = 'save-status ' + status;
        elements.saveStatus.textContent = status === 'saved' ? '✓ Guardado' : status === 'saving' ? 'Guardando...' : status === 'error' ? 'Error' : '';
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
        const counts = {};
        state.notes.forEach(n => { if (n.subject) counts[n.subject] = (counts[n.subject] || 0) + 1; });
        
        let html = `<li class="subject-item ${state.filter.subject === 'all' ? 'active' : ''}" data-subject="all">
            <span class="subject-dot"></span><span class="subject-name">Todas</span>
            <span class="subject-count">${state.notes.length}</span></li>`;
        
        state.subjects.forEach(s => {
            html += `<li class="subject-item ${state.filter.subject === s ? 'active' : ''}" data-subject="${escapeHtml(s)}">
                <span class="subject-dot"></span><span class="subject-name">${escapeHtml(s)}</span>
                <span class="subject-count">${counts[s] || 0}</span></li>`;
        });
        
        elements.subjectList.innerHTML = html;
        elements.totalCount.textContent = state.notes.length;
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
            elements.filesList.innerHTML = '<li style="padding:12px;color:var(--text-muted);font-size:13px">No hay archivos</li>';
            return;
        }
        
        elements.filesList.innerHTML = state.files.map(file => `
            <li class="file-item" data-id="${file.id}">
                <div class="file-icon ${file.type === 'application/pdf' ? 'pdf' : ''}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg>
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

    // ========================================
    // NOTE OPERATIONS
    // ========================================
    function createNewNote() {
        const now = new Date().toISOString();
        state.currentNote = {
            id: generateId(),
            title: '', subject: '', tags: [], content: '',
            createdAt: now, modifiedAt: now
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
        
        elements.noteTitle.value = state.currentNote?.title || '';
        elements.noteSubject.value = state.currentNote?.subject || '';
        elements.noteTags.value = (state.currentNote?.tags || []).join(', ');
        elements.noteContent.value = state.currentNote?.content || '';
        // Autosize textarea to fit content
        autosizeTextarea(elements.noteContent);
        
        updateWordCount();
        elements.noteTitle.focus();
    }

    // Autosize helper for textarea
    function autosizeTextarea(el) {
        if (!el) return;
        el.style.height = 'auto';
        const scrollH = el.scrollHeight;
        el.style.height = Math.max(scrollH, 120) + 'px';
    }

    function closeEditor() {
        if (state.currentNote) {
            saveCurrentNote();
        }
        
        elements.editorView.classList.add('hidden');
        elements.notesView.classList.remove('hidden');
        state.currentNote = null;
        
        renderNotes();
    }

    function updateWordCount() {
        const content = elements.noteContent.value;
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        elements.wordCount.textContent = `${words} palabra${words !== 1 ? 's' : ''}`;
        elements.charCount.textContent = `${content.length} caracter${content.length !== 1 ? 'es' : ''}`;
    }

    function exportNote(noteId) {
        const note = state.notes.find(n => n.id === noteId);
        if (!note) return;
        
        const content = `# ${note.title || 'Sin título'}\n${note.subject ? `**Materia:** ${note.subject}\n` : ''}${note.tags?.length ? `**Etiquetas:** ${note.tags.join(', ')}\n` : ''}\n---\n\n${note.content || ''}`;
        
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${note.title || 'nota'}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ========================================
    // EVENT HANDLERS
    // ========================================
    function setupEventListeners() {
        elements.sidebarToggle.addEventListener('click', () => {
            const isMobile = window.innerWidth <= 900;
            if (isMobile) elements.sidebar.classList.toggle('open');
            else elements.sidebar.classList.toggle('collapsed');
        });

        elements.newNoteBtn.addEventListener('click', createNewNote);
        elements.fileInput.addEventListener('change', handleFileUpload);
        
        const uploadZone = document.getElementById('uploadZone');
        uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.style.borderColor = 'var(--accent-primary)'; });
        uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = ''; });
        uploadZone.addEventListener('drop', e => { 
            e.preventDefault(); 
            uploadZone.style.borderColor = ''; 
            elements.fileInput.files = e.dataTransfer.files; 
            handleFileUpload({ target: elements.fileInput }); 
        });
        
        elements.searchInput.addEventListener('input', debounce(e => { state.filter.search = e.target.value; renderNotes(); }, 300));
        elements.sortSelect.addEventListener('change', e => { state.filter.sort = e.target.value; renderNotes(); });
        
        elements.noteTitle.addEventListener('input', saveCurrentNote);
        elements.noteSubject.addEventListener('input', saveCurrentNote);
        elements.noteTags.addEventListener('input', saveCurrentNote);
        elements.noteContent.addEventListener('input', (e) => { saveCurrentNote(); autosizeTextarea(e.target); });

        // Keyboard shortcuts in the editor
        elements.noteContent.addEventListener('keydown', (e) => {
            const isMod = e.ctrlKey || e.metaKey;
            if (isMod && e.key === 'Enter') {
                // save + sync
                e.preventDefault();
                saveCurrentNote();
                syncToMongo();
                showToast('Nota guardada', 'success');
            }
            if (isMod && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                saveCurrentNote();
                showToast('Nota guardada', 'success');
            }
        });

        // Pressing Enter on title saves and focuses content
        elements.noteTitle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveCurrentNote();
                elements.noteContent.focus();
            }
        });
        
        elements.saveNoteBtn.addEventListener('click', () => {
            saveCurrentNote();
            syncToMongo();
            showToast('Nota guardada', 'success');
        });
        
        elements.backBtn.addEventListener('click', closeEditor);
        
        elements.deleteNoteBtn.addEventListener('click', () => elements.deleteModal.classList.remove('hidden'));
        elements.closeDeleteModal.addEventListener('click', () => elements.deleteModal.classList.add('hidden'));
        elements.cancelDeleteBtn.addEventListener('click', () => elements.deleteModal.classList.add('hidden'));
        elements.confirmDeleteBtn.addEventListener('click', () => {
            elements.deleteModal.classList.add('hidden');
            if (state.currentNote) {
                const noteId = state.currentNote.id;
                closeEditor();
                deleteNote(noteId);
            }
        });
        
        elements.syncBtn.addEventListener('click', () => {
            // Attempt sync and reload notes; MongoDBManager will use the deployed API by default
            syncToMongo();
            loadNotes();
        });
        
        elements.settingsBtn.addEventListener('click', async () => {
            if (MongoDBManager.isConnected()) {
                if (confirm('¿Desconectar MongoDB? Tus notas locales se mantendrán.')) {
                    MongoDBManager.disconnect();
                    elements.userInfo.classList.add('hidden');
                    updateSyncStatus('offline');
                    elements.authModal.classList.remove('hidden');
                    showToast('Desconectado. Tus notas están guardadas localmente.', 'info');
                }
            } else {
                elements.authModal.classList.remove('hidden');
            }
        });
        
        elements.logoutBtn.addEventListener('click', () => {
            if (confirm('¿Desconectar MongoDB? Tus notas locales se mantendrán.')) {
                MongoDBManager.disconnect();
                elements.userInfo.classList.add('hidden');
                updateSyncStatus('offline');
                elements.authModal.classList.remove('hidden');
                showToast('Desconectado. Tus notas están guardadas localmente.', 'info');
            }
        });
        elements.deleteModal.addEventListener('click', e => { if (e.target === elements.deleteModal) elements.deleteModal.classList.add('hidden'); });
        
        // Auth modal event listeners
        elements.closeAuthModal.addEventListener('click', () => {
            // Don't close if already connected
            if (!MongoDBManager.isConnected()) {
                // Allow closing but show again on next action
            }
            elements.authModal.classList.add('hidden');
        });
        
        // MongoDB Connection Form
        elements.mongoConnectForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const serverUrl = elements.connectionString.value.trim();  // Server URL
            const mongoConnString = elements.mongoUserName.value.trim();  // MongoDB connection string
            const remember = elements.rememberConnection.checked;  // Remember preference
            elements.connectBtn.disabled = true;
            elements.connectBtn.textContent = 'Conectando...';
            try {
                // Validar formato del servidor
                if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
                    throw new Error('La URL del servidor debe iniciar con http:// o https://');
                }
                // Validar formato de MongoDB
                if (!mongoConnString.startsWith('mongodb+srv://') && !mongoConnString.startsWith('mongodb://')) {
                    throw new Error('La cadena de MongoDB debe iniciar con mongodb+srv:// o mongodb://');
                }
                // Configurar servidor y conectar
                MongoDBManager.setServerUrl(serverUrl);
                await MongoDBManager.connect(mongoConnString, { name: 'Usuario' });
                // Guardar preferencia de recordar
                MongoDBManager.setRemember(remember);
                elements.authModal.classList.add('hidden');
                showToast('¡Conectado a MongoDB!', 'success');
                await loadNotes();
            } catch (err) {
                showToast(err.message || 'Error al conectar', 'error');
            } finally {
                elements.connectBtn.disabled = false;
                elements.connectBtn.textContent = 'Conectar';
            }
        });
        
        // Remove old login/register handlers
        // elements.loginForm removed
        // elements.registerForm removed
        // elements.authSwitchBtn removed
        
        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); if (elements.editorView.classList.contains('hidden')) createNewNote(); }
            if (e.key === 'Escape' && !elements.editorView.classList.contains('hidden')) closeEditor();
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 900) elements.sidebar.classList.remove('open');
        });
    }

    // Authentication via modal removed — connection managed via settings prompt or backend defaults

    // ========================================
    // WEBSOCKET - Real-time sync
    // ========================================
    let socket = null;
    let wsReconnectTimer = null;
    
    function initWebSocket() {
        // Connect to WebSocket server
        const wsUrl = window.location.protocol === 'https:' ? 'wss://' + window.location.host : 'ws://' + window.location.host;
        socket = io();
        
        socket.on('connect', () => {
            console.log('WebSocket connected:', socket.id);
            updateSyncStatus('connected');
            showToast('Conectado en tiempo real', 'success');
            if (wsReconnectTimer) {
                clearTimeout(wsReconnectTimer);
                wsReconnectTimer = null;
            }
        });
        
        socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
            updateSyncStatus('offline');
            showToast('Conexión perdida - Modo offline', 'error');
            // Try to reconnect
            wsReconnectTimer = setTimeout(initWebSocket, 3000);
        });
        
        socket.on('connected', (data) => {
            console.log('WebSocket handshake complete:', data);
        });
        
        // Listen for note changes from other clients
        socket.on('notesChanged', async (event) => {
            console.log('Notes changed:', event.action, event.data);
            
            // Don't reload if we're the ones making the change
            // The server broadcasts to ALL clients including sender
            // So we need to check if this is our own change or from another client
            
            // For now, always reload to stay in sync
            // The debounce in loadNotes will prevent rapid reloads
            if (MongoDBManager.isConnected()) {
                await loadNotes();
                showToast('Notas actualizadas desde otro dispositivo', 'info');
            }
        });
        
        socket.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    }
    
    // ========================================
    // INITIALIZATION
    // ========================================
    async function init() {
        initElements();
        MongoDBManager.init();
        setupEventListeners();
        
        window.downloadFile = downloadFile;
        window.exportNote = exportNote;
        
        // Start in offline mode by default
        loadFromLocalCache();
        extractSubjects();
        renderNotes();
        renderSubjects();
        renderFiles();
        
        // Check if user is connected to MongoDB
        if (MongoDBManager.isConnected()) {
            updateSyncStatus('connected');
            updateUserInfo();
            showToast('Cargando tus notas...', 'info');
            await loadNotes();
        } else {
            // Check if user wants to remember connection
            if (MongoDBManager.getRemember()) {
                // Try to auto-connect with default values
                try {
                    const defaultServerUrl = window.location.origin; // Use current origin as default server
                    const defaultConnString = 'mongodb+srv://notesuser:YTUAfrXk93dGexMf@notessync.tjyuvhc.mongodb.net/?appName=notessync';
                    MongoDBManager.setServerUrl(defaultServerUrl);
                    await MongoDBManager.connect(defaultConnString, { name: 'Usuario' });
                    showToast('Conectado automáticamente', 'success');
                    await loadNotes();
                } catch (err) {
                    // If auto-connect fails, show modal
                    updateSyncStatus('offline');
                    elements.authModal.classList.remove('hidden');
                    showToast('Conecta tu MongoDB para sincronizar tus notas', 'info');
                }
            } else {
                // Show connection modal
                updateSyncStatus('offline');
                elements.authModal.classList.remove('hidden');
                showToast('Conecta tu MongoDB para sincronizar tus notas', 'info');
            }
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
