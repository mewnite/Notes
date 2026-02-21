/**
 * Notes Sync - Offline Mode
 * Works locally with localStorage + Export/Import for syncing
 */

(function() {
    'use strict';

    const CONFIG = {
        STORAGE_KEY: 'notes_offline_data',
        AUTO_SAVE_DELAY: 300
    };

    const state = {
        notes: [],
        files: [],
        currentNote: null,
        filter: { subject: 'all', search: '', sort: 'modifiedAt' },
        subjects: [],
        isSaving: false
    };

    const elements = {};

    function initElements() {
        elements.app = document.getElementById('app');
        elements.sidebar = document.getElementById('sidebar');
        elements.notesView = document.getElementById('notesView');
        elements.editorView = document.getElementById('editorView');
        elements.sidebarToggle = document.getElementById('sidebarToggle');
        elements.newNoteBtn = document.getElementById('newNoteBtn');
        elements.exportBtn = document.getElementById('exportBtn');
        elements.searchInput = document.getElementById('searchInput');
        elements.subjectList = document.getElementById('subjectList');
        elements.filesList = document.getElementById('filesList');
        elements.totalCount = document.getElementById('totalCount');
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
        elements.deleteModal = document.getElementById('deleteModal');
        elements.closeDeleteModal = document.getElementById('closeDeleteModal');
        elements.cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
        elements.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
        elements.fileInput = document.getElementById('fileInput');
        elements.toastContainer = document.getElementById('toastContainer');
    }

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
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
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

    function showToast(message, type = 'info') {
        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line></svg>',
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line></svg>'
        };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `${icons[type]}<span>${message}</span>`;
        elements.toastContainer.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 200); }, 3000);
    }

    // ========== STORAGE ==========
    function saveData() {
        try {
            const data = { notes: state.notes, files: state.files, lastSave: new Date().toISOString() };
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
            updateSaveStatus('saved');
        } catch (e) {
            console.error('Save error:', e);
            showToast('Error al guardar', 'error');
        }
    }

    function loadData() {
        try {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                state.notes = data.notes || [];
                state.files = data.files || [];
                return true;
            }
        } catch (e) {
            console.error('Load error:', e);
        }
        return false;
    }

    const debouncedSave = debounce(saveData, CONFIG.AUTO_SAVE_DELAY);

    // ========== DATA OPERATIONS ==========
    function saveCurrentNote() {
        if (!state.currentNote) return;
        
        state.currentNote.title = elements.noteTitle.value.trim();
        state.currentNote.subject = elements.noteSubject.value.trim();
        state.currentNote.content = elements.noteContent.value;
        
        const tagsStr = elements.noteTags.value;
        state.currentNote.tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];
        state.currentNote.modifiedAt = new Date().toISOString();
        
        const idx = state.notes.findIndex(n => n.id === state.currentNote.id);
        if (idx === -1) state.notes.unshift(state.currentNote);
        
        updateWordCount();
        debouncedSave();
    }

    async function deleteNote(noteId) {
        const idx = state.notes.findIndex(n => n.id === noteId);
        if (idx > -1) {
            state.notes.splice(idx, 1);
            saveData();
            showToast('Nota eliminada', 'success');
        }
    }

    function extractSubjects() {
        const subjects = new Set();
        state.notes.forEach(n => { if (n.subject?.trim()) subjects.add(n.subject.trim()); });
        state.subjects = Array.from(subjects).sort();
    }

    function getFilteredNotes() {
        let filtered = [...state.notes];
        if (state.filter.subject !== 'all') filtered = filtered.filter(n => n.subject === state.filter.subject);
        if (state.filter.search) {
            const s = state.filter.search.toLowerCase();
            filtered = filtered.filter(n => (n.title || '').toLowerCase().includes(s) || (n.content || '').toLowerCase().includes(s));
        }
        filtered.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
        if (state.filter.sort === 'title') filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        if (state.filter.sort === 'subject') filtered.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
        if (state.filter.sort === 'createdAt') filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return filtered;
    }

    // ========== FILES ==========
    async function handleFileUpload(e) {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        for (const file of files) {
            if (file.size > 5 * 1024 * 1024) {
                showToast(`${file.name} muy grande`, 'error');
                continue;
            }
            try {
                const content = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
                        reader.onload = () => resolve(reader.result);
                        reader.readAsDataURL(file);
                    } else if (file.name.endsWith('.json')) {
                        reader.onload = () => {
                            try {
                                const data = JSON.parse(reader.result);
                                if (data.notes) state.notes = data.notes;
                                if (data.files) state.files = data.files;
                                showToast('Datos importados correctamente', 'success');
                            } catch(err) { reject(err); }
                        };
                        reader.readAsText(file);
                    } else {
                        reader.onload = () => resolve(reader.result);
                        reader.readAsText(file);
                    }
                    reader.onerror = reject;
                });

                if (!file.name.endsWith('.json')) {
                    state.files.push({
                        id: generateId(), name: file.name, type: file.type, size: file.size,
                        content: content, uploadedAt: new Date().toISOString()
                    });
                    showToast(`${file.name} importado`, 'success');
                }
            } catch (err) {
                showToast(`Error: ${file.name}`, 'error');
            }
        }
        saveData();
        renderFiles();
        renderNotes();
        renderSubjects();
        e.target.value = '';
    }

    function exportAll() {
        const data = { notes: state.notes, files: state.files, exportedAt: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `notas_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Notas exportadas', 'success');
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
    }

    // ========== RENDER ==========
    function renderNotes() {
        const filtered = getFilteredNotes();
        elements.notesCount.textContent = `${state.notes.length} nota${state.notes.length !== 1 ? 's' : ''}`;
        
        if (filtered.length === 0 && state.notes.length === 0) {
            elements.emptyState.classList.add('visible');
            elements.notesGrid.innerHTML = '';
            return;
        }
        elements.emptyState.classList.remove('visible');
        
        elements.notesGrid.innerHTML = filtered.map(note => `
            <div class="note-card" data-id="${note.id}">
                <h3 class="note-card-title">${escapeHtml(note.title || 'Sin título')}</h3>
                ${note.subject ? `<span class="note-card-subject">${escapeHtml(note.subject)}</span>` : ''}
                <p class="note-card-preview">${escapeHtml(note.content || 'Sin contenido')}</p>
                <div class="note-card-footer">
                    <span class="note-card-date">${formatDate(note.modifiedAt)}</span>
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
                <button class="file-download" onclick="event.stopPropagation(); downloadFile('${file.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                </button>
            </li>
        `).join('');
    }

    function updateSaveStatus(status) {
        elements.saveStatus.className = 'save-status ' + status;
        elements.saveStatus.textContent = status === 'saved' ? '✓ Guardado' : '';
    }

    function updateWordCount() {
        const content = elements.noteContent.value;
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        elements.wordCount.textContent = `${words} palabra${words !== 1 ? 's' : ''}`;
        elements.charCount.textContent = `${content.length} caracteres`;
    }

    // ========== NOTE OPERATIONS ==========
    function createNewNote() {
        const now = new Date().toISOString();
        state.currentNote = { id: generateId(), title: '', subject: '', tags: [], content: '', createdAt: now, modifiedAt: now };
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
        updateWordCount();
        elements.noteTitle.focus();
    }

    function closeEditor() {
        if (state.currentNote) saveCurrentNote();
        elements.editorView.classList.add('hidden');
        elements.notesView.classList.remove('hidden');
        state.currentNote = null;
        renderNotes();
    }

    // ========== EVENTS ==========
    function setupEvents() {
        elements.sidebarToggle.addEventListener('click', () => {
            elements.sidebar.classList.toggle('collapsed');
        });

        elements.newNoteBtn.addEventListener('click', createNewNote);
        elements.exportBtn.addEventListener('click', exportAll);
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
        elements.noteContent.addEventListener('input', saveCurrentNote);
        
        elements.saveNoteBtn.addEventListener('click', () => { saveCurrentNote(); saveData(); showToast('Guardado', 'success'); });
        elements.backBtn.addEventListener('click', closeEditor);
        
        elements.deleteNoteBtn.addEventListener('click', () => elements.deleteModal.classList.remove('hidden'));
        elements.closeDeleteModal.addEventListener('click', () => elements.deleteModal.classList.add('hidden'));
        elements.cancelDeleteBtn.addEventListener('click', () => elements.deleteModal.classList.add('hidden'));
        elements.confirmDeleteBtn.addEventListener('click', () => {
            elements.deleteModal.classList.add('hidden');
            if (state.currentNote) { const id = state.currentNote.id; closeEditor(); deleteNote(id); }
        });
        
        elements.deleteModal.addEventListener('click', e => { if (e.target === elements.deleteModal) elements.deleteModal.classList.add('hidden'); });
        
        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); if (elements.editorView.classList.contains('hidden')) createNewNote(); }
            if (e.key === 'Escape' && !elements.editorView.classList.contains('hidden')) closeEditor();
        });
    }

    // ========== INIT ==========
    function init() {
        initElements();
        setupEvents();
        
        window.downloadFile = downloadFile;
        
        if (!loadData()) {
            state.notes = [];
            state.files = [];
        }
        
        extractSubjects();
        renderNotes();
        renderSubjects();
        renderFiles();
        showToast('Notas cargadas', 'success');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
