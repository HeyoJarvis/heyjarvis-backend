# 🚀 Quick Start - Deploy in 10 Minutes

## Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

## Step 2: Login
```bash
vercel login
```
Choose **Email** → Enter your email → Check inbox → Enter code

## Step 3: Deploy
```bash
cd /home/sdalal/test/heyjarvis-backend
vercel --prod
```

Answer prompts (mostly just press Enter). You'll get a URL like:
**https://heyjarvis-backend.vercel.app**

📝 **COPY THIS URL!**

## Step 4: Add Your API Keys

Go to: https://vercel.com/dashboard

1. Click **heyjarvis-backend**
2. Click **Settings** → **Environment Variables**
3. Add these 3 variables (click "Add" for each):

   **Variable 1:**
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-your-key-here` ← **YOU NEED TO ADD THIS**
   - Environments: Check all 3 boxes

   **Variable 2:**
   - Name: `SUPABASE_URL`
   - Value: `https://phswgaybvquncyhrlvws.supabase.co`
   - Environments: Check all 3 boxes

   **Variable 3:**
   - Name: `SUPABASE_SERVICE_ROLE_KEY`
   - Value: Your service role key ← **YOU NEED TO ADD THIS**
   - Environments: Check all 3 boxes

4. Go to **Deployments** tab
5. Click **...** → **Redeploy** (to apply the variables)

## Step 5: Test It

```bash
curl https://YOUR_URL.vercel.app/api/health
```

You should see: `{"status":"ok",...}`

## ✅ Done!

Tell me: **"Backend is deployed at [YOUR_URL]"** and I'll update your Electron app!

---

## 📍 Where to Get Your Keys

### ANTHROPIC_API_KEY
- Go to: https://console.anthropic.com/settings/keys
- Copy your API key (starts with `sk-ant-`)

### SUPABASE_SERVICE_ROLE_KEY
- Go to: https://supabase.com/dashboard/project/phswgaybvquncyhrlvws/settings/api
- Copy the **service_role** key (NOT the anon key)
- It's under "Project API keys" → "service_role"

---

## Need Help?

See `DEPLOYMENT_GUIDE.md` for detailed instructions.




