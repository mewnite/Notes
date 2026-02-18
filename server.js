require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

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
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log('API listening on port', port));
}

app.get('/', (req, res) => res.json({ status: 'ok' }));

app.get('/notes', async (req, res) => {
  try {
    const docs = await notesCollection.find().toArray();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/notes', async (req, res) => {
  try {
    const note = req.body;
    const result = await notesCollection.insertOne(note);
    res.json({ insertedId: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Replace all notes and files in the database (used by frontend bulk sync)
app.put('/notes', async (req, res) => {
  try {
    const data = req.body || {};
    const notes = Array.isArray(data.notes) ? data.notes : [];
    const files = Array.isArray(data.files) ? data.files : [];

    // Replace notes collection
    await notesCollection.deleteMany({});
    if (notes.length > 0) {
      const notesToInsert = notes.map(n => ({
        title: n.title,
        subject: n.subject,
        tags: n.tags || [],
        content: n.content,
        createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
        modifiedAt: n.modifiedAt ? new Date(n.modifiedAt) : new Date()
      }));
      await notesCollection.insertMany(notesToInsert);
    }

    // Replace files collection
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

    res.json({ ok: true, notes: notes.length, files: files.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

start().catch(err => { console.error(err); process.exit(1); });
