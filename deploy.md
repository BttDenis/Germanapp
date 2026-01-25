# Deployment guide (Word Sync + MongoDB + full feature set)

This guide walks you step by step from a fresh checkout to a production deployment that
includes word syncing (MongoDB-backed) and image uploads. It covers both the **backend
server** (MongoDB + word sync + image upload) and the **frontend** (Vite static build).

> ✅ If you only want word sync (no image uploads), you can use the lightweight
> `word-sync-server`. The steps below show the **full backend** first, then a
> **word-sync-only** alternative.

---

## 0) Prerequisites

Make sure you have:

- **Node.js 18+** and **npm** on your dev machine.
- A **MongoDB** database (MongoDB Atlas is easiest for hosted DBs).
- A place to deploy:
  - **Backend**: any Node-compatible host (Render, Fly, Railway, DigitalOcean, etc.).
  - **Frontend**: any static host (Vercel, Netlify, GitHub Pages, S3/CloudFront, etc.).

---

## 1) Clone and install

```bash
git clone <your-repo-url>
cd Germanapp
npm install
```

---

## 2) Create MongoDB database (Atlas recommended)

1. Go to **MongoDB Atlas** → Create a **free cluster**.
2. In **Database Access**, create a DB user (username + password).
3. In **Network Access**, add your deployment host IPs (or `0.0.0.0/0` for testing).
4. From **Connect → Drivers**, copy the connection string:

```
mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<db>?retryWrites=true&w=majority
```

Save this for the backend configuration.

---

## 3) Decide backend type

### ✅ Recommended: Full backend server (word sync + image upload)

This server powers:
- Word sync (`/api/words`)
- Image upload (`/api/images`)

### Alternative: Word sync server only

If you only want word sync and no image uploads, see **Step 7** below.

---

## 4) Deploy the backend server (full feature set)

### 4.1 Create backend environment variables

Set these variables in your backend host:

```
MONGODB_URI=<your MongoDB connection string>
MONGODB_DB=germanapp
WORD_SYNC_TOKEN=<random-shared-token>
IMAGE_UPLOAD_TOKEN=<random-shared-token>
IMAGE_STORAGE_PATH=./uploads
PUBLIC_IMAGE_BASE_URL=https://<your-backend-domain>/uploads
PORT=8787
```

**Notes:**
- `WORD_SYNC_TOKEN` and `IMAGE_UPLOAD_TOKEN` can be the same or different.
- `PUBLIC_IMAGE_BASE_URL` should match your backend URL.

### 4.2 Start command

Your backend host should run:

```bash
npm run backend-server
```

### 4.3 Confirm backend is reachable

After deployment, test:

- `GET https://<backend-domain>/api/words`
- `POST https://<backend-domain>/api/images`

If tokens are set, requests must include:

```
Authorization: Bearer <token>
```

---

## 5) Configure frontend environment variables

Create a `.env.production` (or set environment variables on your frontend host):

```
VITE_WORD_SYNC_URL=https://<backend-domain>/api/words
VITE_WORD_SYNC_TOKEN=<WORD_SYNC_TOKEN>
VITE_IMAGE_UPLOAD_URL=https://<backend-domain>/api/images
VITE_IMAGE_UPLOAD_TOKEN=<IMAGE_UPLOAD_TOKEN>
```

These values ensure the app uses the backend for word sync and image uploads.

---

## 6) Build and deploy the frontend

### 6.1 Build

```bash
npm run build
```

### 6.2 Deploy the `dist/` folder

Upload the `dist/` folder to your static host (Vercel, Netlify, etc.).

---

## 7) Optional: Word sync only (no image upload)

If you want only word syncing (and no image upload), use the lightweight server:

### 7.1 Backend environment variables

```
WORD_SYNC_MONGODB_URI=<your MongoDB connection string>
WORD_SYNC_DB_NAME=germanapp
WORD_SYNC_COLLECTION=wordEntries
WORD_SYNC_HISTORY_COLLECTION=wordEntryHistory
WORD_SYNC_TOKEN=<random-shared-token>
WORD_SYNC_PORT=8787
```

### 7.2 Start command

```bash
npm run word-sync-server
```

### 7.3 Frontend env

```
VITE_WORD_SYNC_URL=https://<backend-domain>/words
VITE_WORD_SYNC_TOKEN=<WORD_SYNC_TOKEN>
```

---

## 8) Verify end-to-end

1. Open the deployed frontend.
2. Add a new word → refresh → confirm it persists.
3. On a second device/browser, open the app → confirm the word syncs.
4. Add an image → confirm it uploads and displays correctly.

---

## 9) Troubleshooting tips

- **CORS errors**: Ensure backend is reachable over HTTPS and allows requests.
- **401 Unauthorized**: Check that the `Authorization: Bearer <token>` matches your env.
- **MongoDB connection fails**: Verify IP allowlist and connection string user/password.
- **Images not loading**: Confirm `PUBLIC_IMAGE_BASE_URL` matches backend URL and `/uploads` is served.

---

## 10) Quick checklist (full feature set)

- [ ] MongoDB cluster created
- [ ] Backend deployed with MongoDB + tokens
- [ ] Frontend configured with `VITE_WORD_SYNC_URL` and `VITE_IMAGE_UPLOAD_URL`
- [ ] Frontend built and deployed
- [ ] Word sync tested
- [ ] Image upload tested
