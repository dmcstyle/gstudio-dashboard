# Supabase Setup for SEO Metrics

## 1. Create Table in Supabase

Go to **Supabase Dashboard** → **SQL Editor** and run this query:

```sql
CREATE TABLE seo_metrics (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    total_keywords INTEGER,
    total_clicks INTEGER,
    total_impressions INTEGER,
    avg_ctr NUMERIC,
    avg_position NUMERIC,
    top_query TEXT,
    data_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_seo_metrics_created_at ON seo_metrics(created_at DESC);
```

## 2. Set Environment Variables in GitHub

1. Go to **GitHub Repository** → **Settings** → **Secrets and variables** → **Actions**
2. Add new secret:
   - **Name:** `SUPABASE_KEY`
   - **Value:** Your Supabase Service Role Key (from Supabase Dashboard → Settings → API)

## 3. Manual Run (Test)

To test the sync script manually:

```bash
npm install
SUPABASE_KEY=your-key node scripts/sync-seo-to-supabase.js
```

## 4. Weekly Schedule

The GitHub Actions workflow runs **every Monday at 10:00 AM UTC**.
You can manually trigger it from GitHub Actions tab.

## Dashboard Display

Once data is synced, it will appear on the main dashboard under **"🔍 SEO Dashboard"** section.
