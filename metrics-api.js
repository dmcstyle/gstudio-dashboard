// Metrics API Server with YouTube OAuth
const express = require('express');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3001;
const METRICS_FILE = path.join(__dirname, 'artifacts', 'metrics.json');
const AUTH_FILE = path.join(__dirname, 'artifacts', 'youtube-auth.json');

// YouTube OAuth Config
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const YOUTUBE_REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'https://gstudio-metrics-api.onrender.com/oauth/youtube/callback';

const oauth2Client = new google.auth.OAuth2(
  YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET,
  YOUTUBE_REDIRECT_URI
);

const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});

// Initialize metrics file
function initMetrics() {
  const artifactsDir = path.join(__dirname, 'artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  
  if (!fs.existsSync(METRICS_FILE)) {
    const defaultMetrics = {
      personal: {
        instagram: { views: 0, likes: 0, shares: 0, followers: 0 },
        youtube: { views: 0, likes: 0, shares: 0, followers: 0 }
      },
      studio: {
        instagram: { views: 0, likes: 0, shares: 0, followers: 0 },
        tiktok: { views: 0, likes: 0, shares: 0, followers: 0 },
        youtube: { views: 0, likes: 0, shares: 0, followers: 0 },
        x: { views: 0, likes: 0, followers: 0 },
        threads: { views: 0, likes: 0, followers: 0 }
      },
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(METRICS_FILE, JSON.stringify(defaultMetrics, null, 2));
    console.log('вњ… Created metrics.json');
  }
}

// YouTube OAuth - Start authorization
app.get('/oauth/youtube/authorize', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly'
    ],
    prompt: 'consent'
  });
  res.redirect(authUrl);
});

// YouTube OAuth - Callback
app.get('/oauth/youtube/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    fs.writeFileSync(AUTH_FILE, JSON.stringify(tokens, null, 2));
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>YouTube OAuth Success</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1>вњ… YouTube OAuth Success!</h1>
        <p>Refresh token saved. You can close this window.</p>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body>
      </html>
    `);
    
    console.log('вњ… YouTube OAuth complete');
  } catch (error) {
    console.error('вќЊ OAuth error:', error);
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  }
});

// Fetch YouTube metrics
async function fetchYouTubeMetrics(channelHandle) {
  try {
    if (!fs.existsSync(AUTH_FILE)) {
      throw new Error('YouTube not authenticated. Visit /oauth/youtube/authorize');
    }
    
    const tokens = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    oauth2Client.setCredentials(tokens);
    
    // Search for channel by handle
    const searchResponse = await youtube.search.list({
      part: 'snippet',
      q: channelHandle,
      type: 'channel',
      maxResults: 1
    });
    
    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
      throw new Error(`Channel ${channelHandle} not found`);
    }
    
    const channelId = searchResponse.data.items[0].snippet.channelId;
    
    // Get channel statistics
    const channelResponse = await youtube.channels.list({
      part: 'statistics',
      id: channelId
    });
    
    const stats = channelResponse.data.items[0].statistics;
    
    return {
      views: parseInt(stats.viewCount) || 0,
      followers: parseInt(stats.subscriberCount) || 0,
      likes: 0,
      shares: 0
    };
  } catch (error) {
    console.error('YouTube API Error:', error.message);
    throw error;
  }
}

// GET all metrics
app.get('/api/metrics', (req, res) => {
  try {
    const metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read metrics' });
  }
});

// GET specific account metrics
app.get('/api/metrics/:account/:platform', (req, res) => {
  try {
    const { account, platform } = req.params;
    const metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
    
    if (metrics[account] && metrics[account][platform]) {
      res.json(metrics[account][platform]);
    } else {
      res.status(404).json({ error: 'Metrics not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to read metrics' });
  }
});

// POST/PUT update metrics
app.post('/api/metrics/:account/:platform', (req, res) => {
  try {
    const { account, platform } = req.params;
    const { views, likes, shares, followers } = req.body;
    
    const metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
    
    if (!metrics[account]) metrics[account] = {};
    if (!metrics[account][platform]) metrics[account][platform] = {};
    
    if (views !== undefined) metrics[account][platform].views = parseInt(views);
    if (likes !== undefined) metrics[account][platform].likes = parseInt(likes);
    if (shares !== undefined) metrics[account][platform].shares = parseInt(shares);
    if (followers !== undefined) metrics[account][platform].followers = parseInt(followers);
    
    metrics.lastUpdated = new Date().toISOString();
    
    fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
    
    res.json({ 
      success: true, 
      message: `Updated ${account}/${platform}`,
      data: metrics[account][platform]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update metrics' });
  }
});

// Auto-update YouTube metrics
app.post('/api/update-youtube/:account', async (req, res) => {
  try {
    const { account } = req.params;
    const handle = account === 'personal' ? '@georgeyukhanov' : '@dubaimusicstudio';
    
    const ytMetrics = await fetchYouTubeMetrics(handle);
    
    const metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
    if (!metrics[account]) metrics[account] = {};
    metrics[account].youtube = ytMetrics;
    metrics.lastUpdated = new Date().toISOString();
    
    fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
    
    res.json({ success: true, account, data: ytMetrics });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch update all YouTube metrics
app.post('/api/update-all-youtube', async (req, res) => {
  try {
    const personal = await fetchYouTubeMetrics('@georgeyukhanov');
    const studio = await fetchYouTubeMetrics('@dubaimusicstudio');
    
    const metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
    metrics.personal.youtube = personal;
    metrics.studio.youtube = studio;
    metrics.lastUpdated = new Date().toISOString();
    
    fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
    
    res.json({ success: true, personal, studio });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  const authStatus = fs.existsSync(AUTH_FILE) ? 'authenticated' : 'not authenticated';
  res.json({ 
    status: 'ok', 
    youtube: authStatus,
    timestamp: new Date().toISOString() 
  });
});

// Start server
initMetrics();
app.listen(PORT, () => {
  console.log(`
в•”в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•—
в•‘   G Studio Metrics API                 в•‘
в•‘   рџљЂ http://localhost:${PORT}             в•‘
в•‘                                        в•‘
в•‘   Endpoints:                           в•‘
в•‘   GET  /api/metrics                    в•‘
в•‘   GET  /api/metrics/:account/:platform в•‘
в•‘   POST /api/metrics/:account/:platform в•‘
в•‘   POST /api/update-youtube/:account    в•‘
в•‘   POST /api/update-all-youtube         в•‘
в•‘   GET  /oauth/youtube/authorize        в•‘
в•‘   GET  /api/health                     в•‘
в•љв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ќ
  `);
  
  if (!fs.existsSync(AUTH_FILE)) {
    console.log(`
вљ пёЏ  YouTube not authenticated yet.
рџ‘‰ Visit http://localhost:${PORT}/oauth/youtube/authorize to connect
    `);
  }
});

