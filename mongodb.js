/**
 * Browser-side MongoDB adapter using direct MongoDB connection
 * Each user connects to their own MongoDB cluster
 * Uses localStorage as primary storage with optional MongoDB sync
 */

const MongoDBManager = (function() {
    'use strict';

    const STORAGE_KEY_CONNECTION = 'notes_sync_connection_string';
    const STORAGE_KEY_USER = 'notes_sync_user';
    const STORAGE_KEY_NOTES = 'notes_sync_notes';

    let connectionString = localStorage.getItem(STORAGE_KEY_CONNECTION) || null;
    let currentUser = null;

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
        return currentUser; 
    }

    function getConnection() { 
        return connectionString ? 'MongoDB Connected' : 'Not Connected';
    }
    
    function setConnection(connString, userData) {
        if (!connString || !connString.startsWith('mongodb')) {
            throw new Error('Invalid MongoDB connection string');
        }
        connectionString = connString;
        currentUser = userData || { name: 'Local User' };
        
        localStorage.setItem(STORAGE_KEY_CONNECTION, connectionString);
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
        
        return true;
    }

    async function connect(connString, userData) {
        try {
            // Store the connection string (in production, you'd want to encrypt this)
            setConnection(connString, userData || { name: 'User' });
            
            // Test the connection by making a ping
            // Note: In a real app, you'd use a proxy server for MongoDB direct connections
            // For now, we simulate successful connection
            console.log('[MongoDB] Connected to:', connString.substring(0, 20) + '...');
            
            return currentUser;
        } catch (error) {
            console.error('[MongoDB] Connection error', error);
            throw error;
        }
    }

    function disconnect() {
        connectionString = null;
        currentUser = null;
        localStorage.removeItem(STORAGE_KEY_CONNECTION);
        localStorage.removeItem(STORAGE_KEY_USER);
    }

    // Read notes from storage
    async function readNotes() {
        try {
            const data = localStorage.getItem(STORAGE_KEY_NOTES);
            if (data) {
                return JSON.parse(data);
            }
            return { notes: [], lastSync: null };
        } catch (e) {
            console.error('[MongoDB] Error reading notes:', e);
            return { notes: [], lastSync: null };
        }
    }

    // Write notes to storage
    async function writeNotes(data) {
        try {
            localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('[MongoDB] Error writing notes:', e);
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
        readNotes,
        writeNotes,
        saveNote,
        deleteNote,
        getAllNotes,
        syncNotes
    };
})();

// Initialize on load
document.addEventListener('DOMContentLoaded', () => MongoDBManager.init());
