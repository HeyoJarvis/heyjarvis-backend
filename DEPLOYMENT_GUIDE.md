# HeyJarvis Backend - Deployment Guide

## ✅ Setup Complete!

Your backend is ready to deploy. Follow these steps:

---

## Step 1: Install Vercel CLI (2 minutes)

```bash
npm install -g vercel
```

---

## Step 2: Login to Vercel (2 minutes)

```bash
vercel login
```

- Choose **"Email"** (or GitHub if you prefer)
- If using email:
  - Enter your email
  - Check your inbox for verification code
  - Enter the code in terminal
- You're now logged in!

---

## Step 3: Deploy to Vercel (3 minutes)

```bash
cd /home/sdalal/test/heyjarvis-backend
vercel
```

**Answer the prompts:**
- `Set up and deploy?` → **Y**
- `Which scope?` → Choose your account
- `Link to existing project?` → **N**
- `Project name?` → **heyjarvis-backend** (or press Enter)
- `Code location?` → **./** (press Enter)
- `Override settings?` → **N**

Wait ~30 seconds... You'll get a preview URL like:
`https://heyjarvis-backend-xxx.vercel.app`

---

## Step 4: Deploy to Production (1 minute)

```bash
vercel --prod
```

Wait ~30 seconds... You'll get your production URL:
`https://heyjarvis-backend.vercel.app`

**📝 SAVE THIS URL!** You'll need it for your Electron app.

---

## Step 5: Add Environment Variables (5 minutes)

### Option A: Via Web Dashboard (Recommended)

1. Go to: https://vercel.com/dashboard
2. Click your project: **heyjarvis-backend**
3. Click **Settings** tab (top)
4. Click **Environment Variables** (left sidebar)
5. Add these three variables:

#### Variable 1: ANTHROPIC_API_KEY
- **Key:** `ANTHROPIC_API_KEY`
- **Value:** `sk-ant-your-actual-anthropic-key-here`
- **Environment:** Check all (Production, Preview, Development)
- Click **Save**

#### Variable 2: SUPABASE_URL
- **Key:** `SUPABASE_URL`
- **Value:** `https://phswgaybvquncyhrlvws.supabase.co`
- **Environment:** Check all
- Click **Save**

#### Variable 3: SUPABASE_SERVICE_ROLE_KEY
- **Key:** `SUPABASE_SERVICE_ROLE_KEY`
- **Value:** Your Supabase service role key (from Supabase dashboard)
- **Environment:** Check all
- Click **Save**

6. **Redeploy to apply variables:**
   - Go to **Deployments** tab
   - Click **...** menu on latest deployment
   - Click **Redeploy**
   - Wait ~30 seconds

### Option B: Via CLI (Faster)

```bash
cd /home/sdalal/test/heyjarvis-backend

# Add ANTHROPIC_API_KEY
vercel env add ANTHROPIC_API_KEY
# Paste your key when prompted
# Select: Production, Preview, Development (use space to select all, Enter to confirm)

# Add SUPABASE_URL
vercel env add SUPABASE_URL
# Paste: https://phswgaybvquncyhrlvws.supabase.co
# Select all environments

# Add SUPABASE_SERVICE_ROLE_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
# Paste your service role key
# Select all environments

# Redeploy to apply
vercel --prod
```

---

## Step 6: Test Your Backend (2 minutes)

Replace `YOUR_URL` with your actual Vercel production URL:

### Test health endpoint:
```bash
curl https://YOUR_URL.vercel.app/api/health
```

**Expected response:**
```json
{"status":"ok","timestamp":"2025-11-16T...","message":"HeyJarvis Backend is running!","version":"1.0.0"}
```

### Test AI endpoint:
```bash
curl -X POST https://YOUR_URL.vercel.app/api/ai \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Say hello in 5 words!"}],
    "max_tokens": 100
  }'
```

**Expected response:** JSON with Claude's response

---

## Step 7: Update Your Electron App

Once your backend is deployed and tested, tell me:

**"Update my Electron app to use the backend at https://YOUR_URL.vercel.app"**

I'll automatically update your AIService and other files to use the backend.

---

## 🎯 Quick Reference

### Your Backend Files:
```
/home/sdalal/test/heyjarvis-backend/
├── api/
│   ├── ai.js           # Anthropic AI proxy
│   ├── admin.js        # Supabase admin operations
│   └── health.js       # Health check
├── package.json
├── vercel.json
└── README.md
```

### Common Commands:
```bash
# Deploy to production
vercel --prod

# View logs
vercel logs

# List environment variables
vercel env ls

# Add environment variable
vercel env add VARIABLE_NAME

# Remove deployment
vercel remove heyjarvis-backend
```

### Useful Links:
- **Vercel Dashboard:** https://vercel.com/dashboard
- **Deployment Logs:** Dashboard → Your Project → Logs
- **Environment Variables:** Dashboard → Your Project → Settings → Environment Variables

---

## 🚨 Troubleshooting

### Backend not deploying?
```bash
vercel logs
```

### 500 error on /api/ai?
- Check environment variables are set in Vercel dashboard
- Make sure you redeployed after adding variables

### CORS error?
- Make sure you're using the production URL (not preview)
- Check that the API files have CORS headers

---

## ✅ You're Ready!

Once you complete Steps 1-6, your backend will be live and ready to use.

Then switch back to me and I'll update your Electron app to use it! 🚀




