# Window & Gutter Quote Tool v2

A self-improving quoting app for Melbourne window and gutter cleaning.
Researches properties, generates quotes with negotiation ladders, saves job history,
records actual time and final price, and gets more accurate over time.

## Features
- Quote screen with opening / fallback / floor prices + profit margins
- Job history with status tracking (Lead → Quoted → Booked → Completed)
- Post-job update: record actual hours, final price charged, notes
- Auto-learning: uses past job data to calibrate future quotes
- Webhook endpoint for Google Sheets / Zapier auto-quote on new lead
- Phone-ready PWA (Add to Home Screen on iPhone or Android)

---

## Deploy to Vercel (step by step)

### Step 1 — Push to GitHub
1. Create a free account at github.com
2. Create a new repository called "window-quote-tool"
3. Upload all these files to that repo (drag and drop works fine on github.com)
   - Do NOT upload any file containing your API key

### Step 2 — Create a Vercel account and add Vercel KV
1. Go to vercel.com, sign up free (connect with GitHub)
2. Click "Add New Project" → select your GitHub repo
3. BEFORE clicking Deploy, go to the "Storage" tab in your Vercel dashboard
4. Click "Create Database" → select "KV" (Vercel KV — free tier)
5. Name it anything (e.g. "quote-tool-db")
6. Click "Connect to Project" to link it to your app
   This automatically adds KV_REST_API_URL and KV_REST_API_TOKEN to your environment

### Step 3 — Add environment variables in Vercel
In your Vercel project → Settings → Environment Variables, add:

| Name                  | Value                        |
|-----------------------|------------------------------|
| ANTHROPIC_API_KEY     | sk-ant-... (your key)        |
| NEXT_PUBLIC_APP_URL   | https://your-app.vercel.app  |
| WEBHOOK_SECRET        | any random string you choose |

ANTHROPIC_API_KEY: get from console.anthropic.com → API Keys
NEXT_PUBLIC_APP_URL: your Vercel deployment URL (set this after first deploy)
WEBHOOK_SECRET: make up any password (e.g. "myjobstool2024") — you'll use this in Zapier

### Step 4 — Deploy
Click Deploy. Takes about 1 minute. You get a URL like window-quote-tool.vercel.app

### Step 5 — Add to phone home screen
- Open your Vercel URL on your phone in Safari (iPhone) or Chrome (Android)
- iPhone: tap Share → "Add to Home Screen"
- Android: tap menu → "Add to Home Screen" or "Install App"

---

## Webhook setup (auto-quote when a lead hits your Google Sheet)

Once deployed, your webhook URL is:
  https://your-app.vercel.app/api/webhook

### Setting up Zapier
1. Go to zapier.com (free account)
2. Create a new Zap:
   - Trigger: "Google Sheets" → "New or Updated Row"
   - Select your leads spreadsheet and sheet tab
3. Action: "Webhooks by Zapier" → "POST"
   - URL: https://your-app.vercel.app/api/webhook
   - Payload Type: JSON
   - Data — map your Google Sheet columns to these fields:
     | Field          | Your Sheet Column     |
     |----------------|-----------------------|
     | address        | Address column        |
     | bedrooms       | Bedrooms column       |
     | storeys        | Storeys column        |
     | propType       | Property Type column  |
     | customerName   | Name column           |
     | customerPhone  | Phone column          |
     | extraNotes     | Notes column          |
     | webhookSecret  | (type your WEBHOOK_SECRET value directly) |

4. Test and turn on the Zap

When a new lead comes in, it will:
- Auto-research the property
- Generate a quote
- Appear in your app's History tab under "Lead" status — ready for you to review

---

## Updating the app later

Tell Claude what you want changed → Claude updates the files → you paste them into GitHub → Vercel auto-redeploys in ~30 seconds.

Files most likely to be updated:
- app/page.jsx — the UI
- app/api/quote/route.js — the quote logic and pricing rules
- app/api/webhook/route.js — the webhook handling

---

## Costs
- GitHub: free
- Vercel: free tier (more than enough for personal/small business)
- Vercel KV: free tier (500MB storage, plenty for job history)
- Anthropic API: pay-as-you-go, a few cents per quote (add $20 credit to start)
  See pricing at anthropic.com/pricing
- Zapier: free tier allows 100 tasks/month; paid plans from ~$20/month for more
