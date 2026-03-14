/**
 * Browser-side MongoDB adapter that calls the deployed backend API.
 * It supports overriding the API base URL via localStorage, but defaults
 * to the public Render deployment.
 * Now includes JWT-based authentication.
 */

const MongoDBManager = (function() {
    'use strict';

    const DEFAULT_API = 'https://notes-ekmk.onrender.com';
    const STORAGE_KEY_API = 'notes_sync_api_base';
    const STORAGE_KEY_TOKEN = 'notes_sync_token';
    const STORAGE_KEY_USER = 'notes_sync_user';

    let apiBase = localStorage.getItem(STORAGE_KEY_API) || DEFAULT_API;
    let authToken = localStorage.getItem(STORAGE_KEY_TOKEN) || null;
    let currentUser = null;

    // Try to restore user from localStorage
    try {
        const storedUser = localStorage.getItem(STORAGE_KEY_USER);
        if (storedUser) {
            currentUser = JSON.parse(storedUser);
        }
    } catch (e) {}

    function init() {
        // ensure default stored
        try { localStorage.setItem(STORAGE_KEY_API, apiBase); } catch (e) {}
        return true;
    }

    function getAuthHeader() {
        if (!authToken) return {};
        return { 'Authorization': 'Bearer ' + authToken };
    }

    function isAuthenticated() { 
        return !!authToken && !!currentUser; 
    }
    
    function getUser() { 
        return currentUser; 
    }

    function getConnection() { return apiBase; }
    
    function setConnection(uri) {
        if (!uri || !uri.startsWith('http')) {
            throw new Error('API URL must start with http(s)');
        }
        apiBase = uri.replace(/\/$/, '');
        localStorage.setItem(STORAGE_KEY_API, apiBase);
    }

    async function login(email, password) {
        try {
            const res = await fetch(apiBase + '/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            if (!res.ok) {
                const error = await res.json().catch(() => ({ error: 'Login failed' }));
                throw new Error(error.error || 'Login failed');
            }
            const data = await res.json();
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem(STORAGE_KEY_TOKEN, authToken);
            localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
            return currentUser;
        } catch (error) {
            console.error('[MongoDB] login error', error);
            throw error;
        }
    }

    async function register(name, email, password) {
        try {
            const res = await fetch(apiBase + '/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            if (!res.ok) {
                const error = await res.json().catch(() => ({ error: 'Registration failed' }));
                throw new Error(error.error || 'Registration failed');
            }
            const data = await res.json();
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem(STORAGE_KEY_TOKEN, authToken);
            localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
            return currentUser;
        } catch (error) {
            console.error('[MongoDB] register error', error);
            throw error;
        }
    }

    function logout() {
        authToken = null;
        currentUser = null;
        apiBase = DEFAULT_API;
        try { 
            localStorage.removeItem(STORAGE_KEY_TOKEN); 
            localStorage.removeItem(STORAGE_KEY_USER);
            localStorage.removeItem(STORAGE_KEY_API); 
        } catch (e) {}
    }

    async function testConnection(uri) {
        // If a full URL is provided, test it; otherwise test current apiBase
        const target = (uri && uri.startsWith('http')) ? uri.replace(/\/$/, '') : apiBase;
        try {
            const res = await fetch(target + '/');
            return res.ok;
        } catch (e) {
            console.error('[MongoDB] testConnection failed', e);
            return false;
        }
    }

    async function readNotes() {
        if (!authToken) {
            throw new Error('Authentication required');
        }
        try {
            const res = await fetch(apiBase + '/notes', {
                headers: { ...getAuthHeader() }
            });
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    // Token expired or invalid
                    logout();
                    throw new Error('Session expired. Please login again.');
                }
                throw new Error('Failed to fetch notes: ' + res.status);
            }
            const docs = await res.json();
            const notes = (docs || []).map(d => ({
                id: d._id || d.id || null,
                title: d.title || '',
                subject: d.subject || '',
                tags: d.tags || [],
                content: d.content || '',
                createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
                modifiedAt: d.modifiedAt ? new Date(d.modifiedAt).toISOString() : new Date().toISOString()
            }));
            return { version: '3.0', lastSync: new Date().toISOString(), notes, files: [] };
        } catch (error) {
            console.error('[MongoDB] readNotes error', error);
            throw error;
        }
    }

    async function writeNotes(data) {
        if (!authToken) {
            throw new Error('Authentication required');
        }
        try {
            const res = await fetch(apiBase + '/notes', {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    ...getAuthHeader()
                },
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    logout();
                    throw new Error('Session expired. Please login again.');
                }
                const body = await res.text().catch(() => '');
                throw new Error('Write failed: ' + res.status + ' ' + body);
            }
            return await res.json();
        } catch (error) {
            console.error('[MongoDB] writeNotes error', error);
            throw error;
        }
    }

    return {
        init,
        isAuthenticated,
        getUser,
        getConnection,
        setConnection,
        login,
        register,
        logout,
        testConnection,
        readNotes,
        writeNotes
    };
})();

window.MongoDBManager = MongoDBManager;
