// Metrics API Server
// Stores and serves social media metrics via REST API

const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = 3001;
const METRICS_FILE = path.join(__dirname, 'artifacts', 'metrics.json');

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
    console.log('📝 Created metrics.json');
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
initMetrics();
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   G Studio Metrics API                 ║
║   🎵 http://localhost:${PORT}             ║
║                                        ║
║   Endpoints:                           ║
║   GET  /api/metrics                    ║
║   GET  /api/metrics/:account/:platform ║
║   POST /api/metrics/:account/:platform ║
║   GET  /api/health                     ║
╚════════════════════════════════════════╝
  `);
});
