# HeyJarvis Backend

Backend API for HeyJarvis Electron app. Deployed on Vercel.

## Endpoints

### `/api/health`
Health check endpoint.

**Method:** GET  
**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-16T...",
  "message": "HeyJarvis Backend is running!",
  "version": "1.0.0"
}
```

### `/api/ai`
Anthropic AI API proxy.

**Method:** POST  
**Body:**
```json
{
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 4096
}
```

### `/api/admin`
Supabase admin operations (requires service role key).

**Method:** POST  
**Body:**
```json
{
  "operation": "create_user|update_user|delete_user",
  "data": { ... }
}
```

## Environment Variables

Required in Vercel:
- `ANTHROPIC_API_KEY` - Your Anthropic API key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

## Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy to production
vercel --prod
```

## Local Development

```bash
# Install dependencies
npm install

# Run locally with Vercel CLI
vercel dev
```




