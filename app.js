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
        MAX_FILE_SIZE: 5 * 1024 * 1024,
        SERVER_URL: 'https://notes-ekmk.onrender.com',
        MONGODB_URI: 'mongodb+srv://notesuser:YTUAfrXk93dGexMf@notessync.tjyuvhc.mongodb.net/?appName=notessync'
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

        // Editor enhancements
        elements.templateBtn = document.getElementById('templateBtn');
        elements.templateDropdown = document.getElementById('templateDropdown');
        elements.viewToggleBtn = document.getElementById('viewToggleBtn');
        elements.editorSplit = document.getElementById('editorSplit');
        elements.editorPaneEdit = document.getElementById('editorPaneEdit');
        elements.editorPanePreview = document.getElementById('editorPanePreview');
        elements.notePreview = document.getElementById('notePreview');
        elements.backlinksPanel = document.getElementById('backlinksPanel');
        elements.latexPresetsBtn = document.getElementById('latexPresetsBtn');
        elements.latexPresetsDropdown = document.getElementById('latexPresetsDropdown');
        
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

    function escapeAttr(text) {
        return String(text || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ========================================
    // MARKDOWN + MATH PREVIEW
    // ========================================
    const VIEW_MODE_KEY = 'notes_sync_view_mode';
    state.viewMode = localStorage.getItem(VIEW_MODE_KEY) || 'edit'; // edit | split | preview

    function applyViewMode() {
        const mode = state.viewMode;
        if (!elements.editorSplit || !elements.editorPaneEdit || !elements.editorPanePreview) return;

        elements.editorSplit.classList.toggle('split', mode === 'split');

        if (mode === 'edit') {
            elements.editorPaneEdit.classList.remove('hidden');
            elements.editorPanePreview.classList.add('hidden');
        } else if (mode === 'preview') {
            elements.editorPaneEdit.classList.add('hidden');
            elements.editorPanePreview.classList.remove('hidden');
        } else {
            // split
            elements.editorPaneEdit.classList.remove('hidden');
            elements.editorPanePreview.classList.remove('hidden');
        }
        localStorage.setItem(VIEW_MODE_KEY, mode);
    }

    function cycleViewMode() {
        state.viewMode = state.viewMode === 'edit' ? 'split' : state.viewMode === 'split' ? 'preview' : 'edit';
        applyViewMode();
        updatePreview();
    }

    function tokenizeMath(text) {
        const blocks = [];
        const inlines = [];
        let out = String(text || '');

        // Block math $$...$$ (multiline)
        out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_m, expr) => {
            const idx = blocks.push(expr) - 1;
            return `@@MATHBLOCK_${idx}@@`;
        });

        // Inline math $...$ (single-line-ish)
        out = out.replace(/\$([^\n$]+?)\$/g, (_m, expr) => {
            const idx = inlines.push(expr) - 1;
            return `@@MATHINLINE_${idx}@@`;
        });

        return { text: out, blocks, inlines };
    }

    function renderMathPlaceholders(html, tokens) {
        if (typeof katex === 'undefined') return html;
        let out = html;

        out = out.replace(/@@MATHBLOCK_(\d+)@@/g, (_m, n) => {
            const expr = tokens.blocks[Number(n)] ?? '';
            try {
                return katex.renderToString(expr, { throwOnError: false, displayMode: true });
            } catch (e) {
                return escapeHtml(`$$${expr}$$`);
            }
        });

        out = out.replace(/@@MATHINLINE_(\d+)@@/g, (_m, n) => {
            const expr = tokens.inlines[Number(n)] ?? '';
            try {
                return katex.renderToString(expr, { throwOnError: false, displayMode: false });
            } catch (e) {
                return escapeHtml(`$${expr}$`);
            }
        });

        return out;
    }

    function renderMarkdown(text) {
        const raw = String(text || '');
        const tokens = tokenizeMath(raw);

        // Convert [[Title]] to anchors after markdown render
        const md = tokens.text;
        let html = md;

        if (typeof marked !== 'undefined') {
            html = marked.parse(md, { breaks: true, gfm: true });
        } else {
            html = escapeHtml(md).replace(/\n/g, '<br>');
        }

        // Internal note links
        html = html.replace(/\[\[([^\]]+)\]\]/g, (_m, title) => {
            const t = String(title || '').trim();
            if (!t) return _m;
            return `<a href="#" class="note-link" data-note-title="${escapeAttr(t)}">${escapeHtml(t)}</a>`;
        });

        // Sanitize
        if (typeof DOMPurify !== 'undefined') {
            html = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
        }

        // Replace math placeholders with KaTeX HTML
        html = renderMathPlaceholders(html, tokens);
        return html;
    }

    let previewTimer = null;
    function updatePreview() {
        if (!elements.notePreview || !elements.noteContent) return;
        if (previewTimer) clearTimeout(previewTimer);
        previewTimer = setTimeout(() => {
            elements.notePreview.innerHTML = renderMarkdown(elements.noteContent.value);
            renderBacklinks();
        }, 150);
    }

    function findNoteByTitle(title) {
        const t = String(title || '').trim().toLowerCase();
        if (!t) return null;
        return state.notes.find(n => String(n.title || '').trim().toLowerCase() === t) || null;
    }

    function renderBacklinks() {
        if (!elements.backlinksPanel || !state.currentNote) return;
        const currentTitle = String(state.currentNote.title || '').trim();
        if (!currentTitle) {
            elements.backlinksPanel.innerHTML = '';
            return;
        }

        const needle = `[[${currentTitle.toLowerCase()}]]`;
        const hits = state.notes
            .filter(n => n && n.id !== state.currentNote.id)
            .filter(n => String(n.content || '').toLowerCase().includes(needle))
            .slice(0, 12);

        if (hits.length === 0) {
            elements.backlinksPanel.innerHTML = '';
            return;
        }

        elements.backlinksPanel.innerHTML = `
            <div class="backlinks-title">Referencias a esta nota</div>
            <div class="backlinks-list">
                ${hits.map(n => `<button class="backlinks-chip" data-note-id="${escapeAttr(n.id)}">${escapeHtml(n.title || 'Sin título')}</button>`).join('')}
            </div>
        `;
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
            lastSyncByUs = Date.now();
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
    async function loadNotes(silent) {
        if (!silent) {
            showLoading(true);
            updateSyncStatus('syncing');
        }
        
        try {
            // readNotes() devuelve el array de notas directamente (no { notes })
            const notes = await MongoDBManager.readNotes();
            state.notes = Array.isArray(notes) ? notes : [];
            if (!state.files) state.files = [];
            
            saveToLocalCache();
            updateSyncStatus('synced');
            if (!silent) showToast('Notas cargadas desde MongoDB', 'success');
        } catch (error) {
            console.error('Load error:', error);
            if (!loadFromLocalCache()) {
                state.notes = [];
                state.files = [];
            }
            updateSyncStatus('error');
            if (!silent) showToast('Sin conexión - modo offline', 'info');
        } finally {
            if (!silent) showLoading(false);
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
        applyViewMode();
        updatePreview();
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

    function insertTemplate(key) {
        if (!elements.noteContent) return;
        const now = new Date().toISOString();
        const templates = {
            class: `# Clase\n\n## Tema\n\n## Objetivo\n- \n\n## Teoría\n\n## Fórmulas clave\n- \n\n## Ejemplos\n\n## Dudas / pendientes\n- \n\n---\n_Fecha: ${now}_\n`,
            practice: `# Práctica\n\n## Enunciado\n\n## Datos\n- \n\n## Desarrollo\n\n## Resultado\n\n## Verificación / comentario\n\n---\n_Fecha: ${now}_\n`,
            exam: `# Parcial / Final\n\n## Tema\n\n## Resumen rápido\n\n## Ejercicios tipo\n\n## Errores comunes\n- \n\n## Fórmulas clave\n- \n\n---\n_Fecha: ${now}_\n`
        };
        const t = templates[key];
        if (!t) return;

        const current = elements.noteContent.value || '';
        const insert = current.trim() ? `\n\n${t}` : t;
        const start = elements.noteContent.selectionStart || current.length;
        const end = elements.noteContent.selectionEnd || current.length;
        elements.noteContent.setRangeText(insert, start, end, 'end');
        saveCurrentNote();
        updatePreview();
        showToast('Plantilla insertada', 'success');
    }

    function insertAtCursor(text) {
        if (!elements.noteContent) return;
        const el = elements.noteContent;
        const cur = el.value || '';
        const start = Number.isFinite(el.selectionStart) ? el.selectionStart : cur.length;
        const end = Number.isFinite(el.selectionEnd) ? el.selectionEnd : cur.length;
        el.setRangeText(text, start, end, 'end');
        el.focus();
    }

    function insertLatexPreset(key) {
        if (!elements.noteContent) return;

        const presets = {
            inline: { text: '$ $', cursorBack: 1 },
            block: { text: '\n$$\n\n$$\n', cursorBack: 4 },
            frac: { text: '\\\\frac{}{}', cursorBack: 3 },
            sqrt: { text: '\\\\sqrt{}', cursorBack: 1 },
            pow: { text: '^{}', cursorBack: 1 },
            sub: { text: '_{}', cursorBack: 1 },
            sum: { text: '\\\\sum_{i=1}^{n} ', cursorBack: 0 },
            int: { text: '\\\\int_{a}^{b} ', cursorBack: 0 },
            lim: { text: '\\\\lim_{x\\\\to 0} ', cursorBack: 0 },
            matrix: { text: '\\\\begin{bmatrix}  &  \\\\\n  &  \n\\\\end{bmatrix}', cursorBack: 14 }
        };

        const p = presets[key];
        if (!p) return;

        const el = elements.noteContent;
        const cur = el.value || '';
        const start = Number.isFinite(el.selectionStart) ? el.selectionStart : cur.length;
        const end = Number.isFinite(el.selectionEnd) ? el.selectionEnd : cur.length;

        el.setRangeText(p.text, start, end, 'end');

        // move cursor inside braces/spaces when needed
        if (p.cursorBack && p.cursorBack > 0) {
            const pos = (Number.isFinite(el.selectionStart) ? el.selectionStart : (start + p.text.length)) - p.cursorBack;
            el.setSelectionRange(pos, pos);
        }

        el.focus();
        saveCurrentNote();
        updatePreview();
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
        elements.noteContent.addEventListener('input', (e) => { saveCurrentNote(); autosizeTextarea(e.target); updatePreview(); });

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

        // Templates + View toggle
        if (elements.viewToggleBtn) {
            elements.viewToggleBtn.addEventListener('click', () => cycleViewMode());
        }

        if (elements.templateBtn && elements.templateDropdown) {
            const closeDropdown = () => elements.templateDropdown.classList.add('hidden');
            elements.templateBtn.addEventListener('click', (e) => {
                e.preventDefault();
                elements.templateDropdown.classList.toggle('hidden');
            });
            document.addEventListener('click', (e) => {
                if (!elements.templateDropdown) return;
                const inside = elements.templateDropdown.contains(e.target) || elements.templateBtn.contains(e.target);
                if (!inside) closeDropdown();
            });
            elements.templateDropdown.addEventListener('click', (e) => {
                const btn = e.target.closest('.dropdown-item');
                if (!btn) return;
                const key = btn.getAttribute('data-template');
                insertTemplate(key);
                closeDropdown();
            });
        }

        // LaTeX presets dropdown (fast type)
        if (elements.latexPresetsBtn && elements.latexPresetsDropdown) {
            const close = () => elements.latexPresetsDropdown.classList.add('hidden');
            elements.latexPresetsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                elements.latexPresetsDropdown.classList.toggle('hidden');
            });
            document.addEventListener('click', (e) => {
                const inside = elements.latexPresetsDropdown.contains(e.target) || elements.latexPresetsBtn.contains(e.target);
                if (!inside) close();
            });
            elements.latexPresetsDropdown.addEventListener('click', (e) => {
                const item = e.target.closest('.dropdown-item');
                if (!item) return;
                const key = item.getAttribute('data-latex');
                insertLatexPreset(key);
                close();
            });
        }

        if (elements.notePreview) {
            elements.notePreview.addEventListener('click', (e) => {
                const a = e.target.closest('a.note-link');
                if (!a) return;
                e.preventDefault();
                const title = a.getAttribute('data-note-title') || a.textContent;
                const note = findNoteByTitle(title);
                if (note) openNote(note.id);
                else showToast('No existe una nota con ese título', 'info');
            });
        }

        if (elements.backlinksPanel) {
            elements.backlinksPanel.addEventListener('click', (e) => {
                const chip = e.target.closest('.backlinks-chip');
                if (!chip) return;
                const id = chip.getAttribute('data-note-id');
                if (id) openNote(id);
            });
        }
        
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
        
        if (elements.settingsBtn) {
            elements.settingsBtn.addEventListener('click', () => {
                syncToMongo();
                loadNotes();
                showToast('Sincronizado', 'success');
            });
        }
        if (elements.logoutBtn) {
            elements.logoutBtn.addEventListener('click', () => { updateUserInfo(); });
        }
        elements.deleteModal.addEventListener('click', e => { if (e.target === elements.deleteModal) elements.deleteModal.classList.add('hidden'); });
        
        if (elements.closeAuthModal) elements.closeAuthModal.addEventListener('click', () => { if (elements.authModal) elements.authModal.classList.add('hidden'); });
        if (elements.mongoConnectForm) {
            elements.mongoConnectForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!elements.connectionString || !elements.mongoUserName) return;
                const serverUrl = elements.connectionString.value.trim();
                const mongoConnString = elements.mongoUserName.value.trim();
                try {
                    MongoDBManager.setServerUrl(serverUrl);
                    await MongoDBManager.connect(mongoConnString, { name: 'Usuario' });
                    if (elements.authModal) elements.authModal.classList.add('hidden');
                    initWebSocket();
                    await loadNotes();
                } catch (err) { showToast(err.message || 'Error al conectar', 'error'); }
            });
        }
        
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
    let lastSyncByUs = 0; // Para no mostrar "otro dispositivo" cuando acabamos de guardar nosotros
    
    function initWebSocket() {
        if (typeof io === 'undefined') return;
        const serverUrl = MongoDBManager.getServerUrl();
        const url = serverUrl || window.location.origin;
        if (!serverUrl && window.location.hostname !== 'localhost') return;
        
        if (socket) {
            socket.removeAllListeners();
            socket.disconnect();
            socket = null;
        }
        
        socket = io(url, { transports: ['websocket', 'polling'] });
        
        socket.on('connect', () => {
            console.log('WebSocket connected:', socket.id);
            updateSyncStatus('synced');
            if (wsReconnectTimer) {
                clearTimeout(wsReconnectTimer);
                wsReconnectTimer = null;
            }
        });
        
        socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
            updateSyncStatus('error');
            wsReconnectTimer = setTimeout(initWebSocket, 3000);
        });
        
        socket.on('connected', (data) => {
            console.log('WebSocket handshake complete:', data);
        });
        
        socket.on('notesChanged', async (event) => {
            if (!MongoDBManager.isConnected()) return;
            const isOurSave = Date.now() - lastSyncByUs < 3000;
            await loadNotes(true);
            if (!isOurSave) showToast('Notas actualizadas en tiempo real', 'info');
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
        
        // Conexión fija a Render + MongoDB (sin modal de login)
        MongoDBManager.setServerUrl(CONFIG.SERVER_URL);
        MongoDBManager.setConnection(CONFIG.MONGODB_URI, { name: 'Usuario' });
        MongoDBManager.setRemember(true);
        
        loadFromLocalCache();
        extractSubjects();
        renderNotes();
        renderSubjects();
        renderFiles();
        
        try {
            updateSyncStatus('syncing');
            initWebSocket();
            await loadNotes();
            updateSyncStatus('synced');
        } catch (err) {
            console.error('Init connect failed:', err);
            updateSyncStatus('error');
            showToast('No se pudo conectar - usando caché local', 'info');
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
