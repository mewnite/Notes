# Notes Sync - Specification Document

## 1. Project Overview

**Project Name:** Notes Sync
**Project Type:** Web Application (PWA)
**Core Functionality:** A note-taking application that synchronizes notes between Linux and Windows PCs using GitHub Gist as storage backend.
**Target Users:** Single user (personal use) who takes notes on multiple devices.

## 2. UI/UX Specification

### Layout Structure

**Main Layout:**
- Fixed sidebar (280px) - Navigation and filters
- Main content area - Note list and editor
- Modal overlays for authentication and settings

**Responsive Breakpoints:**
- Desktop: > 900px (sidebar visible)
- Mobile: < 900px (sidebar as drawer)

### Visual Design

**Color Palette:**
- Background Primary: `#0d1117` (dark navy)
- Background Secondary: `#161b22` (card surfaces)
- Background Tertiary: `#21262d` (inputs, hover states)
- Accent Primary: `#58a6ff` (links, active states)
- Accent Secondary: `#238636` (success, save)
- Accent Warning: `#d29922` (warnings)
- Accent Danger: `#f85149` (delete, errors)
- Text Primary: `#c9d1d9` (main text)
- Text Secondary: `#8b949e` (muted text)
- Border: `#30363d`

**Typography:**
- Font Family: `'JetBrains Mono', 'Fira Code', monospace` (primary)
- Font Family: `'Segoe UI', system-ui, sans-serif` (UI elements)
- Heading 1: 24px, weight 600
- Heading 2: 18px, weight 600
- Body: 14px, weight 400
- Small: 12px, weight 400

**Spacing System:**
- Base unit: 4px
- XS: 4px
- SM: 8px
- MD: 16px
- LG: 24px
- XL: 32px

**Visual Effects:**
- Card shadows: `0 8px 24px rgba(0,0,0,0.4)`
- Input focus: `0 0 0 2px #58a6ff40`
- Transitions: 150ms ease-out
- Border radius: 6px (cards), 4px (inputs)

### Components

**1. Sidebar**
- Logo/App name at top
- "New Note" button (prominent)
- Filter by subject (collapsible list)
- Filter by tag
- Sync status indicator
- Settings button
- GitHub connection status

**2. Note List**
- Search bar at top
- Sort options (date, name, subject)
- Note cards showing:
  - Title (truncated)
  - Subject badge
  - Preview text (2 lines)
  - Last modified date
- Empty state illustration
- Loading skeleton

**3. Note Editor**
- Title input (large, prominent)
- Subject dropdown/input
- Tags input (comma-separated)
- Content textarea (markdown support)
- Save button (auto-save indicator)
- Delete button (with confirmation)
- Character/word count

**4. Authentication Modal**
- GitHub OAuth button
- Or Personal Access Token input
- Instructions for creating token

**5. Toast Notifications**
- Success (green)
- Error (red)
- Info (blue)
- Auto-dismiss after 3 seconds

### Animations

- Page load: Fade in (200ms)
- Modal: Scale + fade (150ms)
- Note card hover: Subtle lift (translateY -2px)
- Button hover: Background color transition
- Sidebar collapse: Slide (200ms)

## 3. Functionality Specification

### Core Features

**1. Note Management**
- Create new note with:
  - Title (required)
  - Subject/Matter (required)
  - Tags (optional)
  - Content (required)
  - Created date (auto)
  - Modified date (auto)
- Edit existing notes
- Delete notes (with confirmation)
- Search notes by title/content
- Filter notes by subject
- Sort notes (by date modified, title, subject)

**2. Data Structure (JSON)**
```json
{
  "version": "1.0",
  "lastSync": "ISO-8601 timestamp",
  "notes": [
    {
      "id": "uuid-v4",
      "title": "Note Title",
      "subject": "Physics",
      "tags": ["mechanics", "vectors"],
      "content": "Note content...",
      "createdAt": "ISO-8601",
      "modifiedAt": "ISO-8601"
    }
  ]
}
```

**3. GitHub Gist Integration**
- Authenticate via GitHub Personal Access Token
- Create private Gist to store notes.json
- Read Gist content on app load
- Write changes to Gist on save
- Handle sync conflicts (last-write-wins)
- Show sync status (synced, syncing, error)

**4. Local Storage**
- Cache notes locally for offline access
- Store authentication token securely
- Store user preferences

**5. Auto-sync**
- Sync on app load
- Sync after each save (with debounce)
- Manual sync button
- Offline mode support

### User Interactions and Flows

**First-time Setup:**
1. User opens app → sees auth modal
2. User enters GitHub Personal Access Token
3. App validates token and creates Gist
4. App loads empty note list

**Creating a Note:**
1. User clicks "New Note"
2. Editor opens with empty fields
3. User fills title, subject, tags, content
4. Auto-save triggers after 1 second of inactivity
5. Sync to GitHub Gist
6. Toast shows "Saved"

**Syncing from Another Device:**
1. User opens app on other device
2. App authenticates with same GitHub account
3. App fetches latest Gist content
4. Local cache updated
5. Notes displayed

### Edge Cases

- No internet: Work offline, sync when online
- Invalid token: Show error, prompt re-auth
- Gist not found: Create new one
- Conflict: Use last-modified timestamp
- Empty notes: Show helpful empty state
- Long content: Virtual scrolling if >1000 notes

## 4. Acceptance Criteria

### Visual Checkpoints
- [ ] Dark theme with specified colors applied
- [ ] Sidebar displays filters correctly
- [ ] Note cards show all required info
- [ ] Editor form has all fields
- [ ] Responsive layout works on mobile
- [ ] Animations are smooth

### Functional Checkpoints
- [ ] Can authenticate with GitHub token
- [ ] Can create a new note
- [ ] Can edit existing note
- [ ] Can delete note with confirmation
- [ ] Notes persist in GitHub Gist
- [ ] Notes sync between devices
- [ ] Search filters notes correctly
- [ ] Subject filter works
- [ ] Works offline with local cache

### Technical Checkpoints
- [ ] Valid JSON structure
- [ ] No console errors
- [ ] Fast load time (<2s)
- [ ] Secure token storage
- [ ] Handles API rate limits gracefully
