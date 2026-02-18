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
        console.log('[GistManager] Init - Token exists:', !!token, 'Gist ID:', gistId);
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
        console.log('[GistManager] Saved Gist ID:', newGistId);
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

        const optionsBase = { method, headers };
        if (body) optionsBase.body = JSON.stringify(body);

        // Retry logic for transient failures
        const maxAttempts = 3;
        let attempt = 0;
        let lastError;

        while (attempt < maxAttempts) {
            attempt++;
            try {
                console.log('[GistManager] API Request:', method, endpoint, 'attempt', attempt);
                const response = await fetch(`${API_BASE}${endpoint}`, optionsBase);

                if (!response.ok) {
                    const errorBody = await response.json().catch(() => ({}));
                    console.error('[GistManager] API Error:', response.status, errorBody);
                    // Retry on 5xx server errors
                    if (response.status >= 500 && attempt < maxAttempts) {
                        await new Promise(r => setTimeout(r, 200 * attempt));
                        continue;
                    }
                    throw new Error(errorBody.message || `HTTP ${response.status}`);
                }

                // Attempt to parse JSON; some endpoints may return empty
                const text = await response.text();
                try { return text ? JSON.parse(text) : {}; } catch (e) { return {}; }
            } catch (err) {
                lastError = err;
                console.warn('[GistManager] Request failed, retrying...', err);
                if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 200 * attempt));
            }
        }

        throw lastError || new Error('API request failed');
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

    // Search for existing Gist by description
    async function findExistingGist() {
        console.log('[GistManager] Searching for existing Gist...');
        
        // Try to get by stored ID first
        if (gistId) {
            try {
                console.log('[GistManager] Trying stored ID:', gistId);
                const gist = await apiRequest(`/gists/${gistId}`);
                console.log('[GistManager] Found by ID!');
                return gist;
            } catch (e) {
                console.log('[GistManager] Stored ID not found');
            }
        }

        // Search through all user gists (paginated)
        let page = 1;
        while (true) {
            try {
                console.log('[GistManager] Fetching gists page:', page);
                const gists = await apiRequest(`/gists?page=${page}&per_page=100`);
                
                if (!gists || gists.length === 0) {
                    console.log('[GistManager] No more gists');
                    break;
                }

                for (const gist of gists) {
                    // Check by description OR by filename
                    if (gist.description === GIST_DESCRIPTION || 
                        (gist.files && gist.files[GIST_FILENAME])) {
                        console.log('[GistManager] Found existing Gist:', gist.id);
                        return gist;
                    }
                }

                // If less than 100 results, we're done
                if (gists.length < 100) break;
                page++;
            } catch (e) {
                console.error('[GistManager] Error fetching gists:', e);
                break;
            }
        }

        console.log('[GistManager] No existing Gist found, will create new one');
        return null;
    }

    async function getOrCreateGist() {
        try {
            // Try to find existing Gist
            const existingGist = await findExistingGist();
            
            if (existingGist) {
                // Store the ID for future use
                setGistId(existingGist.id);
                return existingGist;
            }

            // Create new Gist
            console.log('[GistManager] Creating new Gist...');
            const emptyData = {
                version: '2.0',
                lastSync: new Date().toISOString(),
                notes: [],
                files: []
            };

            const newGist = await createGist(emptyData);
            console.log('[GistManager] Created new Gist:', newGist.id);
            return newGist;
        } catch (error) {
            console.error('[GistManager] Error in getOrCreateGist:', error);
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
            console.log('[GistManager] Reading notes...');
            const gist = await getOrCreateGist();
            const file = gist.files[GIST_FILENAME];
            
            if (!file || !file.content) {
                console.log('[GistManager] Empty Gist, returning default');
                return {
                    version: '2.0',
                    lastSync: new Date().toISOString(),
                    notes: [],
                    files: []
                };
            }

            console.log('[GistManager] Gist content length:', file.content.length);
            const data = JSON.parse(file.content);
            console.log('[GistManager] Notes count:', data.notes?.length || 0, 'Files count:', data.files?.length || 0);
            return data;
        } catch (error) {
            console.error('[GistManager] Error reading notes:', error);
            // Try unified local cache key via StorageAdapter
            if (window.StorageAdapter) {
                const cached = await window.StorageAdapter.getItem('notes_sync_local');
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        return {
                            version: parsed.version || '2.0',
                            lastSync: parsed.lastSync || new Date().toISOString(),
                            notes: parsed.notes || [],
                            files: parsed.files || []
                        };
                    } catch (e) {
                        console.warn('[GistManager] Failed parsing local cache', e);
                    }
                }
            } else {
                const cached = localStorage.getItem('notes_sync_local');
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        return {
                            version: parsed.version || '2.0',
                            lastSync: parsed.lastSync || new Date().toISOString(),
                            notes: parsed.notes || [],
                            files: parsed.files || []
                        };
                    } catch (e) {
                        console.warn('[GistManager] Failed parsing local cache', e);
                    }
                }
            }
            throw error;
        }
    }

    async function writeNotes(data) {
        try {
            console.log('[GistManager] Writing notes...');
            // Save unified local cache first (synchronous)
            try {
                if (window.StorageAdapter) await window.StorageAdapter.setItem('notes_sync_local', JSON.stringify({ version: '2.0', lastSync: new Date().toISOString(), notes: data.notes, files: data.files }));
                else localStorage.setItem('notes_sync_local', JSON.stringify({ version: '2.0', lastSync: new Date().toISOString(), notes: data.notes, files: data.files }));
            } catch (e) {
                console.warn('[GistManager] Could not save local cache', e);
            }

            if (!gistId) {
                console.log('[GistManager] No Gist ID, creating...');
                await getOrCreateGist();
            }

            console.log('[GistManager] Updating Gist:', gistId);
            await apiRequest(`/gists/${gistId}`, 'PATCH', {
                description: GIST_DESCRIPTION,
                files: {
                    [GIST_FILENAME]: {
                        content: JSON.stringify(data, null, 2)
                    }
                }
            });

            console.log('[GistManager] Write successful!');
            alert("Actualizado"); 
        } catch (error) {
            console.error('[GistManager] Error writing notes:', error);
            throw error;
        }
    }

    // Write notes attempting a keepalive fetch for unload scenarios
    async function writeNotesKeepalive(data) {
        if (!gistId || !token) return;
        try {
            const endpoint = `${API_BASE}/gists/${gistId}`;
            const body = JSON.stringify({ description: GIST_DESCRIPTION, files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } } });
            // Try navigator.sendBeacon (may not include headers reliably), best-effort
            if (navigator && typeof navigator.sendBeacon === 'function') {
                navigator.sendBeacon(endpoint, body);
                return;
            }
        } catch (e) {
            // continue to fetch fallback
        }

        try {
            await fetch(`${API_BASE}/gists/${gistId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ description: GIST_DESCRIPTION, files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } } }),
                keepalive: true
            });
        } catch (err) {
            console.warn('[GistManager] keepalive write failed', err);
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
        writeNotesKeepalive,
        deleteGist
    };
})();

window.GistManager = GistManager;

