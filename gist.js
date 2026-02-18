/**
 * Notes Sync - GitHub Gist Integration Module
 * Handles all GitHub API interactions for storing and syncing notes & files
 */

const GistManager = (function() {
    'use strict';

    const GIST_FILENAME = 'notes.json';
    const GIST_DESCRIPTION = 'Notes Sync - Your notes and files';
    const API_BASE = 'https://api.github.com';
    const STORAGE_KEY_TOKEN = 'notes_sync_github_token';
    const STORAGE_KEY_GIST_ID = 'notes_sync_gist_id';

    let token = null;
    let gistId = null;

    function init() {
        token = localStorage.getItem(STORAGE_KEY_TOKEN);
        gistId = localStorage.getItem(STORAGE_KEY_GIST_ID);
        return isAuthenticated();
    }

    function isAuthenticated() {
        return token !== null;
    }

    function getToken() { return token; }
    function getGistId() { return gistId; }

    function setToken(newToken) {
        token = newToken;
        localStorage.setItem(STORAGE_KEY_TOKEN, newToken);
    }

    function setGistId(newGistId) {
        gistId = newGistId;
        localStorage.setItem(STORAGE_KEY_GIST_ID, newGistId);
    }

    function logout() {
        token = null;
        gistId = null;
        localStorage.removeItem(STORAGE_KEY_TOKEN);
        localStorage.removeItem(STORAGE_KEY_GIST_ID);
    }

    async function apiRequest(endpoint, method = 'GET', body = null) {
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json'
        };

        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        const response = await fetch(`${API_BASE}${endpoint}`, options);

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        return response.json();
    }

    async function validateToken(newToken) {
        const response = await fetch(`${API_BASE}/user`, {
            headers: {
                'Authorization': `Bearer ${newToken}`,
                'Accept': 'application/vnd.github+json'
            }
        });

        if (!response.ok) throw new Error('Token inválido');
        return response.json();
    }

    async function getOrCreateGist() {
        try {
            if (gistId) {
                try {
                    const gist = await apiRequest(`/gists/${gistId}`);
                    return gist;
                } catch (e) {
                    console.log('Gist not found, creating new one');
                }
            }

            const emptyData = {
                version: '2.0',
                lastSync: new Date().toISOString(),
                notes: [],
                files: []
            };

            const newGist = await createGist(emptyData);
            return newGist;
        } catch (error) {
            console.error('Error getting/creating gist:', error);
            throw error;
        }
    }

    async function createGist(data) {
        const gist = await apiRequest('/gists', 'POST', {
            description: GIST_DESCRIPTION,
            public: false,
            files: {
                [GIST_FILENAME]: {
                    content: JSON.stringify(data, null, 2)
                }
            }
        });

        setGistId(gist.id);
        return gist;
    }

    async function readNotes() {
        try {
            const gist = await getOrCreateGist();
            const file = gist.files[GIST_FILENAME];
            
            if (!file || !file.content) {
                return {
                    version: '2.0',
                    lastSync: new Date().toISOString(),
                    notes: [],
                    files: []
                };
            }

            const data = JSON.parse(file.content);
            return data;
        } catch (error) {
            console.error('Error reading notes:', error);
            const cachedNotes = localStorage.getItem('notes_sync_local_notes');
            const cachedFiles = localStorage.getItem('notes_sync_local_files');
            
            if (cachedNotes || cachedFiles) {
                return {
                    version: '2.0',
                    lastSync: new Date().toISOString(),
                    notes: cachedNotes ? JSON.parse(cachedNotes) : [],
                    files: cachedFiles ? JSON.parse(cachedFiles) : []
                };
            }
            throw error;
        }
    }

    async function writeNotes(data) {
        try {
            localStorage.setItem('notes_sync_local_notes', JSON.stringify(data.notes));
            localStorage.setItem('notes_sync_local_files', JSON.stringify(data.files));

            if (!gistId) {
                await createGist(data);
                return;
            }

            await apiRequest(`/gists/${gistId}`, 'PATCH', {
                description: GIST_DESCRIPTION,
                files: {
                    [GIST_FILENAME]: {
                        content: JSON.stringify(data, null, 2)
                    }
                }
            });
        } catch (error) {
            console.error('Error writing notes:', error);
            throw error;
        }
    }

    async function deleteGist() {
        if (!gistId) return;
        try {
            await apiRequest(`/gists/${gistId}`, 'DELETE');
            setGistId(null);
        } catch (error) {
            console.error('Error deleting gist:', error);
            throw error;
        }
    }

    return {
        init,
        isAuthenticated,
        getToken,
        getGistId,
        setToken,
        setGistId,
        logout,
        validateToken,
        getOrCreateGist,
        readNotes,
        writeNotes,
        deleteGist
    };
})();

window.GistManager = GistManager;
