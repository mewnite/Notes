/**
 * Notes Sync - MongoDB Atlas Storage Module
 * 
 * Usage:
 * 1. Create free cluster at https://www.mongodb.com/cloud/atlas
 * 2. Get connection string (Driver: Node.js)
 * 3. Add database name at end of URI: /notessync
 * 
 * Connection string format:
 * mongodb+srv://<username>:<password>@cluster0.xxx.mongodb.net/notessync?retryWrites=true&w=majority
 */

const MongoDBManager = (function() {
    'use strict';

    const STORAGE_KEY_CONNECTION = 'notes_sync_mongo_uri';

    let mongoUri = null;
    let client = null;
    let db = null;

    function init() {
        mongoUri = localStorage.getItem(STORAGE_KEY_CONNECTION);
        return isAuthenticated();
    }

    function isAuthenticated() {
        return mongoUri !== null;
    }

    function getConnection() {
        return mongoUri;
    }

    function setConnection(uri) {
        mongoUri = uri;
        localStorage.setItem(STORAGE_KEY_CONNECTION, uri);
    }

    function logout() {
        mongoUri = null;
        client = null;
        db = null;
        localStorage.removeItem(STORAGE_KEY_CONNECTION);
    }

    async function connect() {
        if (!mongoUri) throw new Error('No MongoDB URI configured');
        
        try {
            const { MongoClient } = await import('https://unpkg.com/mongodb@6.8.0/dist/mongodb.esm.mjs');
            
            client = new MongoClient(mongoUri);
            await client.connect();
            
            // Extract database name from URI - MongoDB allows underscores!
            // Format: mongodb+srv://user:pass@cluster.mongodb.net/DATABASE?options
            const uriObj = new URL(mongoUri);
            const pathParts = uriObj.pathname.split('/').filter(p => p);
            let dbName = pathParts[0] || 'test';
            
            // If no database in path, check appName parameter
            if (!pathParts[0] && uriObj.searchParams.has('appName')) {
                dbName = uriObj.searchParams.get('appName');
            }
            
            db = client.db(dbName);
            console.log('[MongoDB] Connected to database:', dbName);
            
            return { client, db };
        } catch (error) {
            console.error('[MongoDB] Connection error:', error);
            throw error;
        }
    }

    async function testConnection(uri) {
        try {
            const { MongoClient } = await import('https://unpkg.com/mongodb@6.8.0/dist/mongodb.esm.mjs');
            const testClient = new MongoClient(uri);
            await testClient.connect();
            await testClient.db().command({ ping: 1 });
            await testClient.close();
            return true;
        } catch (error) {
            console.error('[MongoDB] Test failed:', error);
            return false;
        }
    }

    async function readNotes() {
        try {
            await connect();
            
            const notesCollection = db.collection('notes');
            const filesCollection = db.collection('files');
            
            const notes = await notesCollection.find({}).toArray();
            const files = await filesCollection.find({}).toArray();
            
            console.log(`[MongoDB] Loaded ${notes.length} notes, ${files.length} files`);
            
            return {
                version: '3.0',
                lastSync: new Date().toISOString(),
                notes: notes.map(n => ({
                    id: n._id.toString(),
                    title: n.title,
                    subject: n.subject,
                    tags: n.tags || [],
                    content: n.content,
                    createdAt: n.createdAt?.toISOString() || new Date().toISOString(),
                    modifiedAt: n.modifiedAt?.toISOString() || new Date().toISOString()
                })),
                files: files.map(f => ({
                    id: f._id.toString(),
                    name: f.name,
                    type: f.type,
                    size: f.size,
                    content: f.content,
                    uploadedAt: f.uploadedAt?.toISOString() || new Date().toISOString()
                }))
            };
        } catch (error) {
            console.error('[MongoDB] Read error:', error);
            throw error;
        }
    }

    async function writeNotes(data) {
        try {
            await connect();
            
            const notesCollection = db.collection('notes');
            const filesCollection = db.collection('files');
            
            await notesCollection.deleteMany({});
            if (data.notes && data.notes.length > 0) {
                const notesToInsert = data.notes.map(n => ({
                    title: n.title,
                    subject: n.subject,
                    tags: n.tags || [],
                    content: n.content,
                    createdAt: new Date(n.createdAt),
                    modifiedAt: new Date(n.modifiedAt)
                }));
                await notesCollection.insertMany(notesToInsert);
            }
            
            await filesCollection.deleteMany({});
            if (data.files && data.files.length > 0) {
                const filesToInsert = data.files.map(f => ({
                    name: f.name,
                    type: f.type,
                    size: f.size,
                    content: f.content,
                    uploadedAt: new Date(f.uploadedAt)
                }));
                await filesCollection.insertMany(filesToInsert);
            }
            
            console.log(`[MongoDB] Saved ${data.notes?.length || 0} notes, ${data.files?.length || 0} files`);
        } catch (error) {
            console.error('[MongoDB] Write error:', error);
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
