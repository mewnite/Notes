# Backend (Express + MongoDB Atlas)

Steps to run locally:

1. Copy `.env.example` to `.env` and fill `MONGODB_URI` with your Atlas connection string.

2. Install dependencies:

```bash
npm install
```

3. Run locally:

```bash
npm start
```

API endpoints:
- `GET /` -> health check
- `GET /notes` -> list notes
- `POST /notes` -> insert note (JSON body)

Notes:
- Do NOT commit your real `.env` to git. Keep credentials private.
- You can host this backend on Vercel, Render or Railway and keep `MONGODB_URI` in their environment settings.
