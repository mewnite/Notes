/**
 * Browser-side MongoDB adapter that calls the deployed backend API.
 * It supports overriding the API base URL via localStorage, but defaults
 * to the public Render deployment.
 */

const MongoDBManager = (function() {
    'use strict';

    const DEFAULT_API = 'https://notes-ekmk.onrender.com';
    const STORAGE_KEY_API = 'notes_sync_api_base';

    let apiBase = localStorage.getItem(STORAGE_KEY_API) || DEFAULT_API;

    function init() {
        // ensure default stored
        try { localStorage.setItem(STORAGE_KEY_API, apiBase); } catch (e) {}
        return true;
    }

    function isAuthenticated() { return !!apiBase; }
    function getConnection() { return apiBase; }
    function setConnection(uri) {
        if (!uri || !uri.startsWith('http')) {
            throw new Error('API URL must start with http(s)');
        }
        apiBase = uri.replace(/\/$/, '');
        localStorage.setItem(STORAGE_KEY_API, apiBase);
    }

    function logout() {
        apiBase = DEFAULT_API;
        try { localStorage.removeItem(STORAGE_KEY_API); } catch (e) {}
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
        try {
            const res = await fetch(apiBase + '/notes');
            if (!res.ok) throw new Error('Failed to fetch notes: ' + res.status);
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
        try {
            const res = await fetch(apiBase + '/notes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) {
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
        getConnection,
        setConnection,
        logout,
        testConnection,
        readNotes,
        writeNotes
    };
})();

window.MongoDBManager = MongoDBManager;
