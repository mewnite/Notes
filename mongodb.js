/**
 * Browser-side MongoDB adapter that calls the deployed backend API.
 * Uses the public Render URL as the API endpoint and exposes the same
 * methods the app expects (`init`, `readNotes`, `writeNotes`, etc.).
 */

const MongoDBManager = (function() {
    'use strict';

    const API_BASE = 'https://notes-ekmk.onrender.com';
    const STORAGE_KEY_CONNECTION = 'notes_sync_mongo_uri';

    // We treat the backend API as the authoritative connector, so the
    // manager is considered "authenticated" by default.
    function init() {
        // store the API base for compatibility with UI that shows connection
        try { localStorage.setItem(STORAGE_KEY_CONNECTION, API_BASE); } catch (e) {}
        return true;
    }

    function isAuthenticated() { return true; }
    function getConnection() { return API_BASE; }
    function setConnection(uri) { try { localStorage.setItem(STORAGE_KEY_CONNECTION, uri); } catch (e) {} }
    function logout() { try { localStorage.removeItem(STORAGE_KEY_CONNECTION); } catch (e) {} }

    async function testConnection(uri) {
        try {
            const res = await fetch((uri || API_BASE) + '/');
            return res.ok;
        } catch (e) {
            console.error('[MongoDB] testConnection failed', e);
            return false;
        }
    }

    async function readNotes() {
        try {
            const res = await fetch(API_BASE + '/notes');
            if (!res.ok) throw new Error('Failed to fetch notes: ' + res.status);
            const docs = await res.json();

            // Map DB docs into app format
            const notes = (docs || []).map(d => ({
                id: d._id || d.id || (d._id && d._id.toString && d._id.toString()) || null,
                title: d.title || '',
                subject: d.subject || '',
                tags: d.tags || [],
                content: d.content || '',
                createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
                modifiedAt: d.modifiedAt ? new Date(d.modifiedAt).toISOString() : new Date().toISOString()
            }));

            // Files are stored in a separate collection; backend currently does not expose a files endpoint
            // We'll return an empty files array to keep the app working.
            return { version: '3.0', lastSync: new Date().toISOString(), notes, files: [] };
        } catch (error) {
            console.error('[MongoDB] readNotes error', error);
            throw error;
        }
    }

    async function writeNotes(data) {
        try {
            const res = await fetch(API_BASE + '/notes', {
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
