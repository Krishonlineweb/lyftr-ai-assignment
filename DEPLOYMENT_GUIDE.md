# Complete Step-by-Step Deployment Guide (Git to Live Public URLs)

This guide takes you through the entire journey: from initializing Git, pushing your code safely to GitHub without exposing secrets, deploying the FastAPI backend to Render.com (or Railway), and deploying the React frontend to Vercel (or Netlify). At the end, you will have a live, publicly accessible URL that anyone can use from any browser or device.

---

## Overview of the Live Architecture

```
[User Browser (Anywhere)] 
       │
       ▼
[Frontend: Vercel / Netlify]  (e.g., https://lyftr-ai-chat.vercel.app)
       │
       ▼  (HTTPS REST calls to /health, /chat, /sessions)
[Backend: Render.com / Railway] (e.g., https://lyftr-ai-backend.onrender.com)
       ├── LiteLLM Gateway & Caching
       ├── Automatic Key Failover (Groq / Gemini)
       └── SQLite Persistent Storage (/data/app.db)
```

---

## Phase 1: Push Code to GitHub

### 1.1 Verify Secrets Are Ignored
Your real API keys live in `.env`. Thanks to our `.gitignore` file, `.env` and `data/` will **never** be pushed to GitHub:
```bash
git status
```
Check that `.env` is **NOT** listed under files to be committed. Only `.env.example` should be committed.

### 1.2 Initialize Git and Commit
Open PowerShell or your terminal in the project root (`c:\Users\KRISH DAWAR\Desktop\Lyftr AI`):

```bash
# 1. Initialize git repository (if not already done)
git init

# 2. Stage all project files
git add .

# 3. Create initial commit
git commit -m "feat: complete Lyftr AI Full-Stack Assignment (FastAPI + LiteLLM + React + SQLite)"
```

### 1.3 Create a New GitHub Repository
1. Go to [github.com](https://github.com) and log in.
2. In the top right corner, click **`+`** -> **New repository**.
3. Name your repository (e.g., `lyftr-ai-llm-gateway`).
4. Set visibility to **Public** (required by the assignment submission).
5. **Do NOT** check "Add a README file", ".gitignore", or "license" (we already created them).
6. Click **Create repository**.

### 1.4 Push Local Code to GitHub
Copy the commands shown on GitHub:

```bash
# Rename branch to main
git branch -M main

# Link your local repo to your GitHub repo (replace with your actual GitHub username and repo name)
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/lyftr-ai-llm-gateway.git

# Push your code
git push -u origin main
```

---

## Phase 2: Deploy Backend to Render.com

[Render.com](https://render.com) provides free and fast cloud hosting for Python web services.

### 2.1 Sign Up / Log In
1. Go to [dashboard.render.com](https://dashboard.render.com).
2. Sign in with your **GitHub account** so Render can access your repositories.

### 2.2 Create a New Web Service
1. Click **New +** in the top right and select **Web Service**.
2. Under "Connect a repository", search for and select your repository (`lyftr-ai-llm-gateway`).
3. Click **Connect**.

### 2.3 Configure the Service Settings
Fill in the following exact configuration:

| Field | Setting |
| :--- | :--- |
| **Name** | `lyftr-ai-backend` (or any unique name you prefer) |
| **Region** | Choose the closest region (e.g., Singapore, Frankfurt, Oregon) |
| **Branch** | `main` |
| **Root Directory** | `backend` *(Important!)* |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| **Instance Type** | **Free** |

### 2.4 Add Environment Variables on Render
Scroll down to the **Environment Variables** section and click **Add Environment Variable** for each:

| Key | Value | Explanation |
| :--- | :--- | :--- |
| `LLM_API_KEYS` | `gsk_key1,gsk_key2` | Your 2 Groq API keys separated by a comma (no spaces) |
| `LLM_MODEL` | `groq/openai/gpt-oss-120b` | Groq model currently active on your tier |
| `DATABASE_URL` | `sqlite:///./data/app.db` | Path for SQLite storage |
| `ENABLE_FAILURE_SIMULATION` | `true` | **Mandatory** for assignment failover testing |
| `ALLOWED_ORIGINS` | `*` | Allows cross-origin requests from your frontend |

### 2.5 Deploy & Test Backend
1. Click **Create Web Service** at the bottom.
2. Render will now build and start your service (takes ~2 minutes).
3. Once deployed, Render will display your live backend URL at the top:  
   `https://lyftr-ai-backend-xxxx.onrender.com`
4. **Test the backend**:
   Open a new browser tab and navigate to:
   - `https://lyftr-ai-backend-xxxx.onrender.com/health`  
     *Expected Response:* `{"status":"ok","keys_configured":2,"cache_enabled":true}`
   - `https://lyftr-ai-backend-xxxx.onrender.com/docs`  
     *Interactive Swagger API documentation page.*

**Copy your live backend URL!** You need it for Phase 3.

---

## Phase 3: Deploy Frontend to Vercel

[Vercel](https://vercel.com) provides free, global edge hosting for modern React applications.

### 3.1 Sign Up / Log In
1. Go to [vercel.com](https://vercel.com).
2. Click **Sign Up** and choose **Continue with GitHub**.

### 3.2 Import the Project
1. In your Vercel Dashboard, click **Add New...** -> **Project**.
2. Find your repository (`lyftr-ai-llm-gateway`) and click **Import**.

### 3.3 Configure Build & Environment Settings
1. **Framework Preset**: Vite (detected automatically).
2. **Root Directory**:
   - Click **Edit** next to Root Directory.
   - Select the **`frontend`** folder and click **Continue**.
3. **Environment Variables**:
   - Expand the **Environment Variables** section.
   - Add:
     - **Name**: `VITE_API_URL`
     - **Value**: `https://lyftr-ai-backend-xxxx.onrender.com` *(Paste your Render backend URL from Phase 2, with NO trailing slash)*
4. Click **Deploy**.

### 3.4 Your Frontend is Live!
1. Vercel will build and deploy the React UI in ~30–45 seconds.
2. When finished, you will see congratulations and your live production URL:  
   `https://lyftr-ai-llm-gateway-xxxx.vercel.app`
3. Click the link to open the app!

---

## Phase 4: Verification of Live System (Assignment Checklist)

Once your live frontend is opened:

1. **Check System Status**:
   - The status pill in the top header should show: **`Online | Keys: 2 | Cache: Active`**.
2. **Live Multi-turn Conversation**:
   - Send a query like: `"What is the capital of Japan?"`.
   - The response should appear with metadata:
     - `Resolution source`: **`LIVE_INFERENCE`**
     - `Model`: `groq/openai/gpt-oss-120b`
     - `Latency`: ~400–800 ms
     - `Tokens`: Input & output token counts
     - `Key`: `key_1`
3. **Verify Response Caching**:
   - Refresh the browser tab (a new session is initialized).
   - Send the **exact same query** again: `"What is the capital of Japan?"`.
   - The response immediately returns with:
     - `Resolution source`: **`LLM_CACHE`**
     - `Latency`: **1–15 ms** (sub-millisecond cache hit)
     - `Key`: `null` (badge hidden)
4. **Verify Failover Test Hook (`X-Simulate-Failure`)**:
   - Click **Controls** in the top bar.
   - Under *Simulate Failure Hook*, select **`key_1=429`**.
   - Send a new message: *"Testing failover"*.
   - Key 1 simulates a rate limit; the gateway automatically resolves via **`key_2`** (badge shows `key_2 (after 1 fallback)`).
   - Select **`*=429`** to simulate complete exhaustion: the chat UI gracefully displays `All Providers Unavailable (503)` without crashing or showing an error stack.

---

## Summary of URLs for Submission

| Deliverable | URL Format |
| :--- | :--- |
| **Live Frontend URL** | `https://your-app-name.vercel.app` |
| **Live Backend URL** | `https://your-backend-name.onrender.com` |
| **Public GitHub Repo** | `https://github.com/<username>/lyftr-ai-llm-gateway` |
| **Demo Video (2–3 mins)**| Loom / YouTube / Google Drive link |
