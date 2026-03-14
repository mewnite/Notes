require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const { createServer } = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const client = new MongoClient(uri);
let usersCollection;
let notesCollection;

async function start() {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'notesdb');
  usersCollection = db.collection('users');
  notesCollection = db.collection('notes');
  
  // Create indexes
  await usersCollection.createIndex({ email: 1 }, { unique: true });
  await notesCollection.createIndex({ userId: 1 });
  
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
function broadcastChange(action, data, userId) {
  io.emit('notesChanged', { action, data, timestamp: Date.now(), userId });
  console.log(`Broadcast: ${action}`, data.id || data.title || 'bulk');
}

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// ========================================
// AUTH ROUTES
// ========================================

// Register new user
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Check if user exists
    const existingUser = await usersCollection.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = {
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      password: hashedPassword,
      createdAt: new Date()
    };
    
    const result = await usersCollection.insertOne(user);
    
    // Generate token
    const token = jwt.sign(
      { userId: result.insertedId.toString(), email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({
      token,
      user: {
        id: result.insertedId.toString(),
        email: user.email,
        name: user.name
      }
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user
    const user = await usersCollection.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Generate token
    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name
      }
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Get current user
app.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ _id: new require('mongodb').ObjectId(req.user.userId) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: user._id.toString(),
      email: user.email,
      name: user.name
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ========================================
// NOTES ROUTES (Protected)
// ========================================

app.get('/', (req, res) => res.json({ status: 'ok', websocket: 'available', auth: 'enabled' }));

// Get all notes for authenticated user
app.get('/notes', authenticateToken, async (req, res) => {
  try {
    const docs = await notesCollection.find({ userId: req.user.userId }).toArray();
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

// Create new note
app.post('/notes', authenticateToken, async (req, res) => {
  try {
    const note = req.body;
    const userId = req.user.userId;
    
    if (note && note.id) {
      const toStore = Object.assign({}, note, {
        userId,
        createdAt: note.createdAt ? new Date(note.createdAt) : new Date(),
        modifiedAt: note.modifiedAt ? new Date(note.modifiedAt) : new Date()
      });
      await notesCollection.replaceOne({ id: note.id, userId }, toStore, { upsert: true });
      res.json({ ok: true, id: note.id });
      broadcastChange('updated', { id: note.id, ...note }, userId);
    } else {
      const toStore = Object.assign({}, note, {
        userId,
        createdAt: note.createdAt ? new Date(note.createdAt) : new Date(),
        modifiedAt: note.modifiedAt ? new Date(note.modifiedAt) : new Date()
      });
      const result = await notesCollection.insertOne(toStore);
      res.json({ insertedId: result.insertedId });
      broadcastChange('created', { id: toStore.id || result.insertedId.toString(), ...note }, userId);
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Replace all notes (sync)
app.put('/notes', authenticateToken, async (req, res) => {
  try {
    const data = req.body || {};
    const notes = Array.isArray(data.notes) ? data.notes : [];
    const files = Array.isArray(data.files) ? data.files : [];
    const userId = req.user.userId;

    // Delete user's notes
    await notesCollection.deleteMany({ userId });
    if (notes.length > 0) {
      const notesToInsert = notes.map(n => ({
        id: n.id || undefined,
        userId,
        title: n.title,
        subject: n.subject,
        tags: n.tags || [],
        content: n.content,
        createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
        modifiedAt: n.modifiedAt ? new Date(n.modifiedAt) : new Date()
      }));
      await notesCollection.insertMany(notesToInsert);
    }
    broadcastChange('synced', { notes: notes.length, files: files.length }, userId);

    res.json({ ok: true, notes: notes.length, files: files.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Delete note
app.delete('/notes/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user.userId;
    
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const result = await notesCollection.deleteOne({ id, userId });
    if (result.deletedCount && result.deletedCount > 0) {
      res.json({ ok: true, deleted: result.deletedCount });
      broadcastChange('deleted', { id }, userId);
    } else {
      res.status(404).json({ ok: false, deleted: 0 });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

start().catch(err => { console.error(err); process.exit(1); });
