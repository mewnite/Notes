/**
 * Browser-side MongoDB adapter using Atlas Data API
 * Allows direct connection to MongoDB Atlas without a backend server
 */

const MongoDBManager = (function() {
    'use strict';

    const STORAGE_KEY_CONNECTION = 'notes_sync_connection_string';
    const STORAGE_KEY_CONNECTION_ENC = 'notes_sync_connection_enc';
    const STORAGE_KEY_CONNECTION_HASH = 'notes_sync_connection_hash';
    const STORAGE_KEY_USER = 'notes_sync_user';
    const STORAGE_KEY_NOTES = 'notes_sync_notes';
    const STORAGE_KEY_ATLAS_API_URL = 'notes_sync_atlas_api_url';
    const STORAGE_KEY_ATLAS_API_KEY = 'notes_sync_atlas_api_key';

    let connectionString = null;
    let currentUser = null;
    let atlasApiUrl = localStorage.getItem(STORAGE_KEY_ATLAS_API_URL) || '';
    let atlasApiKey = localStorage.getItem(STORAGE_KEY_ATLAS_API_KEY) || '';

    // Try to restore user from localStorage
    try {
        const storedUser = localStorage.getItem(STORAGE_KEY_USER);
        if (storedUser) {
            currentUser = JSON.parse(storedUser);
        }
    } catch (e) {}

    // Crypto helpers (Web Crypto API)
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();

    async function sha256Hex(str){
        const data = textEncoder.encode(str);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function randomBytes(len){
        const arr = new Uint8Array(len);
        crypto.getRandomValues(arr);
        return arr;
    }

    async function deriveKey(passwordBytes, salt){
        const keyMaterial = await crypto.subtle.importKey('raw', passwordBytes, {name: 'PBKDF2'}, false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            {name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256'},
            keyMaterial,
            {name: 'AES-GCM', length: 256},
            false,
            ['encrypt', 'decrypt']
        );
    }

    function toB64(u8){ return btoa(String.fromCharCode(...u8)); }
    function fromB64(b64){ return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }

    async function encryptConnString(connStr){
        let deviceSecret = localStorage.getItem('notes_sync_device_secret');
        if (!deviceSecret){
            const rb = randomBytes(32);
            deviceSecret = toB64(rb);
            localStorage.setItem('notes_sync_device_secret', deviceSecret);
        }
        const salt = randomBytes(16);
        const iv = randomBytes(12);
        const key = await deriveKey(fromB64(deviceSecret), salt);
        const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, textEncoder.encode(connStr));
        return { salt: toB64(salt), iv: toB64(iv), data: toB64(new Uint8Array(ct)) };
    }

    async function decryptConnString(enc){
        try{
            const deviceSecret = localStorage.getItem('notes_sync_device_secret');
            if (!deviceSecret) return null;
            const salt = fromB64(enc.salt);
            const iv = fromB64(enc.iv);
            const data = fromB64(enc.data);
            const key = await deriveKey(fromB64(deviceSecret), salt);
            const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv}, key, data);
            return textDecoder.decode(pt);
        }catch(e){
            console.warn('[MongoDB] Decrypt failed', e);
            return null;
        }
    }

    async function init() {
        try{
            const encJson = localStorage.getItem(STORAGE_KEY_CONNECTION_ENC);
            const hash = localStorage.getItem(STORAGE_KEY_CONNECTION_HASH);
            if (encJson && hash){
                const enc = JSON.parse(encJson);
                const conn = await decryptConnString(enc);
                if (conn){
                    const h = await sha256Hex(conn);
                    if (h === hash){
                        connectionString = conn;
                        console.log('[MongoDB] Connection string restored');
                    }
                }
            }
        }catch(e){ /* ignore */ }
        return true;
    }

    function isConnected() { 
        return !!connectionString || (!!atlasApiUrl && !!atlasApiKey); 
    }
    
    function getUser() { 
        return currentUser || { name: 'Usuario local', email: 'local@device' }; 
    }

    function getConnection() { 
        return isConnected() ? 'MongoDB Atlas Connected' : 'No conectado';
    }
    
    async function setConnection(connString, options) {
        connectionString = connString;
        const userOpt = (options && options.user) || { name: 'Usuario local', email: 'local@device' };
        currentUser = userOpt;
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
        if (options && options.remember){
            const enc = await encryptConnString(connString);
            const hash = await sha256Hex(connString);
            localStorage.setItem(STORAGE_KEY_CONNECTION_ENC, JSON.stringify(enc));
            localStorage.setItem(STORAGE_KEY_CONNECTION_HASH, hash);
        } else {
            localStorage.removeItem(STORAGE_KEY_CONNECTION_ENC);
            localStorage.removeItem(STORAGE_KEY_CONNECTION_HASH);
        }
        return true;
    }

    // Configure Atlas Data API credentials
    function configureAtlas(apiUrl, apiKey) {
        atlasApiUrl = apiUrl;
        atlasApiKey = apiKey;
        localStorage.setItem(STORAGE_KEY_ATLAS_API_URL, atlasApiUrl);
        localStorage.setItem(STORAGE_KEY_ATLAS_API_KEY, atlasApiKey);
    }

    function getAtlasApiUrl() {
        return atlasApiUrl;
    }

    function getAtlasApiKey() {
        return atlasApiKey;
    }

    async function connect(connString, options) {
        try {
            await setConnection(connString, options);
            console.log('[MongoDB] Connection configured (SRV stored)');
            if (atlasApiUrl && atlasApiKey) {
                try {
                    const notesData = await readNotesFromAtlas();
                    if (notesData && notesData.length > 0) {
                        await writeNotes({ notes: notesData, lastSync: Date.now() });
                        console.log('[MongoDB] Cargadas', notesData.length, 'notas de MongoDB Atlas (Data API)');
                    }
                } catch (e) {
                    console.log('[MongoDB] Atlas Data API no disponible, usando almacenamiento local');
                }
            }
            return currentUser;
        } catch (error) {
            console.error('[MongoDB] Error de conexión:', error);
            throw error;
        }
    }

    // Read notes from MongoDB Atlas Data API
    async function readNotesFromAtlas() {
        if (!atlasApiUrl || !atlasApiKey) {
            throw new Error('API de Atlas no configurada');
        }
        
        try {
            const response = await fetch(`${atlasApiUrl}/find`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': atlasApiKey
                },
                body: JSON.stringify({
                    dataSource: 'Cluster0',
                    database: 'notesdb',
                    collection: 'notes',
                    filter: {}
                })
            });
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Error: ${response.status} - ${error}`);
            }
            
            const data = await response.json();
            return data.documents || [];
        } catch (e) {
            console.error('[MongoDB] Error al leer de Atlas:', e);
            throw e;
        }
    }

    // Write notes to MongoDB Atlas Data API
    async function writeNotesToAtlas(notes) {
        if (!atlasApiUrl || !atlasApiKey) {
            throw new Error('API de Atlas no configurada');
        }
        
        try {
            // Delete all existing notes and insert new ones
            // First delete all
            await fetch(`${atlasApiUrl}/deleteMany`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': atlasApiKey
                },
                body: JSON.stringify({
                    dataSource: 'Cluster0',
                    database: 'notesdb',
                    collection: 'notes',
                    filter: {}
                })
            });
            
            // Then insert new notes
            if (notes && notes.length > 0) {
                const notesToInsert = notes.map(n => ({
                    ...n,
                    modifiedAt: new Date(n.modifiedAt || Date.now())
                }));
                
                await fetch(`${atlasApiUrl}/insertMany`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': atlasApiKey
                    },
                    body: JSON.stringify({
                        dataSource: 'Cluster0',
                        database: 'notesdb',
                        collection: 'notes',
                        documents: notesToInsert
                    })
                });
            }
            
            console.log('[MongoDB] Notas guardadas en Atlas');
            return true;
        } catch (e) {
            console.error('[MongoDB] Error al escribir en Atlas:', e);
            throw e;
        }
    }

    function disconnect() {
        connectionString = null;
        currentUser = null;
        localStorage.removeItem(STORAGE_KEY_CONNECTION);
        localStorage.removeItem(STORAGE_KEY_CONNECTION_ENC);
        localStorage.removeItem(STORAGE_KEY_CONNECTION_HASH);
        localStorage.removeItem(STORAGE_KEY_USER);
    }

    // Read notes from storage (localStorage with fallback to Atlas)
    async function readNotes() {
        try {
            // First try to read from Atlas if configured
            if (isConnected()) {
                try {
                    const atlasNotes = await readNotesFromAtlas();
                    if (atlasNotes && atlasNotes.length > 0) {
                        // Cache locally as well
                        localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify({ notes: atlasNotes, lastSync: Date.now() }));
                        return { notes: atlasNotes, lastSync: Date.now() };
                    }
                } catch (e) {
                    console.log('[MongoDB] Atlas no disponible, usando cache local');
                }
            }
            
            // Fallback to localStorage
            const data = localStorage.getItem(STORAGE_KEY_NOTES);
            if (data) {
                return JSON.parse(data);
            }
            return { notes: [], lastSync: null };
        } catch (e) {
            console.error('[MongoDB] Error leyendo notas:', e);
            return { notes: [], lastSync: null };
        }
    }

    // Write notes to storage (both localStorage and Atlas)
    async function writeNotes(data) {
        try {
            // Save to localStorage first
            localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(data));
            
            // Also try to save to Atlas if connected
            if (isConnected()) {
                try {
                    await writeNotesToAtlas(data.notes);
                } catch (e) {
                    console.log('[MongoDB] No se pudo guardar en Atlas');
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
        getHashedConnection: async () => connectionString ? (await sha256Hex(connectionString)) : null,
        disconnect,
        isConnected,
        getUser,
        getConnection,
        setConnection,
        configureAtlas,
        getAtlasApiUrl,
        getAtlasApiKey,
        readNotes,
        writeNotes,
        saveNote,
        deleteNote,
        getAllNotes,
        syncNotes
    };
})();
