require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
app.use(cors());
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

start().catch(err => { console.error(err); process.exit(1); });
