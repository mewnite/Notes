require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
// Respect CORS_ORIGIN env var, fallback to '*' for development
const allowed = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: allowed }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI not set in environment. See .env.example');
  process.exit(1);
}

const client = new MongoClient(uri);
let notesCollection;

async function start() {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'notesdb');
  notesCollection = db.collection('notes');
  
  // WebSocket connection handling
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Send initial connection confirmation
    socket.emit('connected', { status: 'ok', socketId: socket.id });
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
  
  const port = process.env.PORT || 3000;
  httpServer.listen(port, () => console.log('Server + WebSocket listening on port', port));
}

// Broadcast note changes to all connected clients
function broadcastChange(action, data) {
  io.emit('notesChanged', { action, data, timestamp: Date.now() });
  console.log(`Broadcast: ${action}`, data.id || data.title || 'bulk');
}

app.get('/', (req, res) => res.json({ status: 'ok', websocket: 'available' }));

app.get('/notes', async (req, res) => {
  try {
    const docs = await notesCollection.find().toArray();
    // Normalize documents: expose `id` field for clients and convert dates to ISO
    const out = docs.map(d => ({
      id: d.id || (d._id ? d._id.toString() : undefined),
      title: d.title,
      subject: d.subject,
      tags: d.tags || [],
      content: d.content,
      createdAt: d.createdAt ? d.createdAt.toISOString() : undefined,
      modifiedAt: d.modifiedAt ? d.modifiedAt.toISOString() : undefined
    }));
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/notes', async (req, res) => {
  try {
    const note = req.body;
    // If client provides an `id`, upsert by `id` to preserve stable identifiers
    if (note && note.id) {
      const toStore = Object.assign({}, note, {
        createdAt: note.createdAt ? new Date(note.createdAt) : new Date(),
        modifiedAt: note.modifiedAt ? new Date(note.modifiedAt) : new Date()
      });
      await notesCollection.replaceOne({ id: note.id }, toStore, { upsert: true });
      res.json({ ok: true, id: note.id });
      // Broadcast updated note to all clients
      broadcastChange('updated', { id: note.id, ...note });
    } else {
      const toStore = Object.assign({}, note, {
        createdAt: note.createdAt ? new Date(note.createdAt) : new Date(),
        modifiedAt: note.modifiedAt ? new Date(note.modifiedAt) : new Date()
      });
      const result = await notesCollection.insertOne(toStore);
      res.json({ insertedId: result.insertedId });
      // Broadcast new note to all clients
      broadcastChange('created', { id: toStore.id || result.insertedId.toString(), ...note });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /notes - replace notes and files collections
app.put('/notes', async (req, res) => {
  try {
    const data = req.body || {};
    const notes = Array.isArray(data.notes) ? data.notes : [];
    const files = Array.isArray(data.files) ? data.files : [];

    // Replace notes
    // We'll replace server-side notes but preserve any provided `id` fields
    await notesCollection.deleteMany({});
    if (notes.length > 0) {
      const notesToInsert = notes.map(n => ({
        id: n.id || undefined,
        title: n.title,
        subject: n.subject,
        tags: n.tags || [],
        content: n.content,
        createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
        modifiedAt: n.modifiedAt ? new Date(n.modifiedAt) : new Date()
      }));
      await notesCollection.insertMany(notesToInsert);
    }
    // Broadcast bulk sync to all clients
    broadcastChange('synced', { notes: notes.length, files: files.length });

    // Replace files
    const filesCollection = client.db(process.env.MONGODB_DB || 'notesdb').collection('files');
    await filesCollection.deleteMany({});
    if (files.length > 0) {
      const filesToInsert = files.map(f => ({
        name: f.name,
        type: f.type,
        size: f.size,
        content: f.content,
        uploadedAt: f.uploadedAt ? new Date(f.uploadedAt) : new Date()
      }));
      await filesCollection.insertMany(filesToInsert);
    }

    // Provide a list of removed IDs? (clients can infer deletions by missing ids)

    res.json({ ok: true, notes: notes.length, files: files.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /notes/:id - delete a single note by client-provided id
app.delete('/notes/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const result = await notesCollection.deleteOne({ id: id });
    if (result.deletedCount && result.deletedCount > 0) {
      res.json({ ok: true, deleted: result.deletedCount });
      // Broadcast deletion to all clients
      broadcastChange('deleted', { id });
    } else {
      // Try deleting by _id if id looks like ObjectId
      res.status(404).json({ ok: false, deleted: 0 });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

start().catch(err => { console.error(err); process.exit(1); });
