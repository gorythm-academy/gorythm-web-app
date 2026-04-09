# Vercel Backend Deployment

This folder contains Vercel-specific backend deployment files.

## Use in Vercel

- Create a separate Vercel project for backend.
- Set **Root Directory** to `backend/vercel`.
- Add environment variables:
  - `MONGODB_URI`
  - `JWT_SECRET`
  - `FRONTEND_URL`
  - `DEFAULT_ADMIN_EMAIL`
  - `DEFAULT_ADMIN_PASSWORD`
  - `DEFAULT_ADMIN_NAME`

## How it works

- `api/index.js` reuses the existing Express app from `backend/server.js`.
- `vercel.json` routes all requests to the Node serverless function.
- Local development still works via `backend/server.js` as before.

