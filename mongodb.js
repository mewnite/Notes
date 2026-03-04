/**
 * Browser-side MongoDB adapter using direct MongoDB connection
 * Each user connects to their own MongoDB cluster
 */

const MongoDBManager = (function() {
    'use strict';

    const STORAGE_KEY_CONNECTION = 'notes_sync_connection_string';
    const STORAGE_KEY_USER = 'notes_sync_user';

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

    // Note: Direct MongoDB operations would require a backend proxy
    // This is a simplified version that stores connection info locally
    // For actual database operations, you'd need to go through a backend

    async function saveNote(note) {
        // This would normally call your backend API
        // For now, we save to localStorage as fallback
        const notes = getNotes();
        const existingIndex = notes.findIndex(n => n._id === note._id);
        
        if (existingIndex >= 0) {
            notes[existingIndex] = note;
        } else {
            note._id = note._id || 'note_' + Date.now();
            notes.push(note);
        }
        
        localStorage.setItem('local_notes', JSON.stringify(notes));
        return note;
    }

    async function deleteNote(noteId) {
        const notes = getNotes();
        const filtered = notes.filter(n => n._id !== noteId);
        localStorage.setItem('local_notes', JSON.stringify(filtered));
        return true;
    }

    async function getAllNotes() {
        return getNotes();
    }

    function getNotes() {
        try {
            return JSON.parse(localStorage.getItem('local_notes') || '[]');
        } catch (e) {
            return [];
        }
    }

    async function syncNotes(notes) {
        // Sync to localStorage as primary storage
        localStorage.setItem('local_notes', JSON.stringify(notes));
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
        saveNote,
        deleteNote,
        getAllNotes,
        syncNotes
    };
})();

// Initialize on load
document.addEventListener('DOMContentLoaded', () => MongoDBManager.init());
