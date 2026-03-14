/**
 * Browser-side MongoDB adapter
 * Connects to a backend server that handles MongoDB connections
 */

const MongoDBManager = (function() {
    'use strict';

    const STORAGE_KEY_CONNECTION = 'notes_sync_connection_string';
    const STORAGE_KEY_USER = 'notes_sync_user';
    const STORAGE_KEY_NOTES = 'notes_sync_notes';
    const STORAGE_KEY_SERVER_URL = 'notes_sync_server_url';
    const STORAGE_KEY_REMEMBER = 'notes_sync_remember';

    let connectionString = localStorage.getItem(STORAGE_KEY_CONNECTION) || null;
    let currentUser = null;
    let serverUrl = localStorage.getItem(STORAGE_KEY_SERVER_URL) || '';
    let rememberConnection = localStorage.getItem(STORAGE_KEY_REMEMBER) === 'true';

    // Try to restore user from localStorage
    try {
        const storedUser = localStorage.getItem(STORAGE_KEY_USER);
        if (storedUser) {
            currentUser = JSON.parse(storedUser);
        }
    } catch (e) {}

    function init() {
        return true;
    }

    function isConnected() { 
        return !!connectionString && !!currentUser; 
    }
    
    function getUser() { 
        return currentUser || { name: 'Usuario local' }; 
    }

    function getConnection() { 
        return connectionString ? 'Conectado a MongoDB' : 'No conectado';
    }
    
    function setConnection(connString, userData) {
        connectionString = connString;
        currentUser = userData || { name: 'Usuario local' };
        
        localStorage.setItem(STORAGE_KEY_CONNECTION, connectionString);
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
        
        return true;
    }

    // Configure the server URL
    function setServerUrl(url) {
        serverUrl = url;
        localStorage.setItem(STORAGE_KEY_SERVER_URL, serverUrl);
    }

    function getServerUrl() {
        return serverUrl;
    }

    // Remember connection preference
    function setRemember(remember) {
        rememberConnection = remember;
        localStorage.setItem(STORAGE_KEY_REMEMBER, remember ? 'true' : 'false');
    }

    function getRemember() {
        return rememberConnection;
    }

    async function connect(connString, userData) {
        try {
            setConnection(connString, userData || { name: 'Usuario' });
            
            console.log('[MongoDB] Connection configured (SRV stored):', connString.substring(0, 30) + '...');
            
            // Try to fetch notes from server
            try {
                const notesData = await readNotes();
                if (notesData && notesData.length > 0) {
                    console.log('[MongoDB] Cargadas', notesData.length, 'notas del servidor');
                }
            } catch (e) {
                console.log('[MongoDB] No se pudo conectar al servidor');
            }
            
            return currentUser;
        } catch (error) {
            console.error('[MongoDB] Error de conexión:', error);
            throw error;
        }
    }

    function disconnect() {
        connectionString = null;
        currentUser = null;
        localStorage.removeItem(STORAGE_KEY_CONNECTION);
        localStorage.removeItem(STORAGE_KEY_USER);
    }

    // Read notes from the backend server
    async function readNotes() {
        try {
            // Use serverUrl if set, otherwise use current origin
            const baseUrl = serverUrl || window.location.origin;
            const url = new URL('/api/notes', baseUrl);
            if (connectionString) {
                url.searchParams.set('conn', connectionString);
            }
            
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-mongodb-conn': connectionString || ''
                }
            });
            
            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Save to localStorage as backup
            localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify({ notes: data.notes || [], lastSync: Date.now() }));
            
            return data.notes || [];
        } catch (e) {
            // Silently handle server errors, fallback to localStorage
            // Don't log 404 errors to console to avoid spam
            
            // Fallback to localStorage
            const data = localStorage.getItem(STORAGE_KEY_NOTES);
            if (data) {
                return JSON.parse(data).notes || [];
            }
            return [];
        }
    }

    // Write notes to the backend server
    async function writeNotesToServer(notes) {
        try {
            // Use serverUrl if set, otherwise use current origin
            const baseUrl = serverUrl || window.location.origin;
            const url = new URL('/api/notes', baseUrl);
            if (connectionString) {
                url.searchParams.set('conn', connectionString);
            }
            
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-mongodb-conn': connectionString || ''
                },
                body: JSON.stringify({ 
                    notes: notes
                })
            });
            
            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }
            
            return await response.json();
        } catch (e) {
            console.error('[MongoDB] Error al escribir notas:', e);
            throw e;
        }
    }

    // Write notes to storage
    async function writeNotes(data) {
        try {
            // Save to localStorage first
            localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(data));
            
            // Also try to save to server if connected
            if (isConnected()) {
                try {
                    await writeNotesToServer(data.notes);
                    console.log('[MongoDB] Notas guardadas en MongoDB');
                } catch (e) {
                    console.log('[MongoDB] No se pudo guardar en MongoDB');
                }
            }
            
            return true;
        } catch (e) {
            console.error('[MongoDB] Error escribiendo notas:', e);
            return false;
        }
    }

    // Legacy function names for compatibility
    async function saveNote(note) {
        const data = await readNotes();
        let notes = data.notes || [];
        
        const existingIndex = notes.findIndex(n => n._id === note._id);
        
        if (existingIndex >= 0) {
            notes[existingIndex] = note;
        } else {
            note._id = note._id || 'note_' + Date.now();
            notes.push(note);
        }
        
        await writeNotes({ notes: notes, lastSync: Date.now() });
        return note;
    }

    async function deleteNote(noteId) {
        const data = await readNotes();
        const notes = (data.notes || []).filter(n => n._id !== noteId);
        await writeNotes({ notes: notes, lastSync: Date.now() });
        return true;
    }

    async function getAllNotes() {
        const data = await readNotes();
        return data.notes || [];
    }

    async function syncNotes(notes) {
        await writeNotes({ notes: notes, lastSync: Date.now() });
        return notes;
    }

    // Public API
    return {
        init,
        connect,
        disconnect,
        isConnected,
        getUser,
        getConnection,
        setConnection,
        setServerUrl,
        getServerUrl,
        setRemember,
        getRemember,
        readNotes,
        writeNotes,
        saveNote,
        deleteNote,
        getAllNotes,
        syncNotes
    };
})();
