#!/usr/bin/env node

/**
 * DataForSEO Integration Script
 * Fetches search volumes and creates keyword research database
 */

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const DATAFORSEO_EMAIL = process.env.DATAFORSEO_EMAIL || 'george@eneron.ai';
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD || '927dc71b31a9b647';
const SUPABASE_URL = 'https://tvxkiimxzmnlibyxapnk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// DataForSEO API call helper
function makeDataForSEORequest(data) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${DATAFORSEO_EMAIL}:${DATAFORSEO_PASSWORD}`).toString('base64');
    
    const options = {
      hostname: 'api.dataforseo.com',
      path: '/v3/keywords_data/google_search_volume/live',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(data))
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

async function getSearchVolumes(keywords) {
  console.log(`🔍 Fetching search volumes for ${keywords.length} keywords...`);
  
  try {
    const response = await makeDataForSEORequest({
      data: keywords.map(kw => ({
        keyword: kw,
        location_code: 784, // UAE
        language_code: 'en'
      }))
    });

    if (!response.tasks || response.tasks.length === 0) {
      console.error('❌ No response from DataForSEO');
      return {};
    }

    const volumeMap = {};
    const tasks = response.tasks[0];
    
    if (tasks.data) {
      tasks.data.forEach(item => {
        volumeMap[item.keyword] = {
          search_volume: item.search_volume || 0,
          competition: item.competition || 0,
          cpc: item.cpc || 0
        };
      });
    }

    console.log(`✅ Got volumes for ${Object.keys(volumeMap).length} keywords`);
    return volumeMap;
  } catch (error) {
    console.error('❌ Error fetching volumes:', error.message);
    return {};
  }
}

async function fetchGSCKeywords() {
  console.log('📊 Fetching top keywords from GSC...');
  
  const { google } = require('googleapis');
  const path = require('path');
  const keyFile = path.join(__dirname, '../config/gsc-key.json');

  const auth = new google.auth.GoogleAuth({
    keyFile: keyFile,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });

  const webmaster = google.webmasters('v3');

  try {
    const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    const response = await webmaster.searchanalytics.query({
      auth: auth,
      siteUrl: 'sc-domain:dubaimusicstudio.com',
      requestBody: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        dimensions: ['query'],
        rowLimit: 25000,
      }
    });

    const keywords = (response.data.rows || []).map(row => ({
      query: row.keys[0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0
    }));

    console.log(`✅ Got ${keywords.length} keywords from GSC`);
    return keywords;
  } catch (error) {
    console.error('❌ Error fetching GSC data:', error.message);
    return [];
  }
}

async function generateDubaiKeywords() {
  console.log('🌍 Generating Dubai-focused keywords...');

  const baseTerms = [
    'music studio',
    'recording studio',
    'music production',
    'voice recording',
    'audio recording',
    'music lessons',
    'music producer',
    'sound engineer',
    'beat making',
    'vocal recording',
    'mixing',
    'mastering',
    'music composition',
    'song production',
    'podcast studio',
    'audio production',
    'dubbing studio',
    'music booth',
    'rehearsal studio',
    'jam studio'
  ];

  const locations = [
    'dubai',
    'abu dhabi',
    'uae',
    'emirates',
    'jumeirah',
    'marina'
  ];

  const keywords = [];
  
  for (const term of baseTerms) {
    keywords.push(term); // Base
    keywords.push(`${term} dubai`);
    keywords.push(`best ${term} dubai`);
    keywords.push(`${term} in dubai`);
    keywords.push(`${term} near me`);
    keywords.push(`cheap ${term} dubai`);
    keywords.push(`professional ${term}`);
  }

  return [...new Set(keywords)]; // Deduplicate
}

async function saveKeywords(gscKeywords, dubaiKeywords, volumeMap) {
  console.log('💾 Saving to Supabase...');

  try {
    // Merge GSC keywords with volumes
    const enrichedKeywords = gscKeywords.map(kw => ({
      keyword: kw.query,
      search_volume: volumeMap[kw.query]?.search_volume || 0,
      competition: volumeMap[kw.query]?.competition || 0,
      cpc: volumeMap[kw.query]?.cpc || 0,
      gsc_clicks: kw.clicks,
      gsc_impressions: kw.impressions,
      gsc_ctr: kw.ctr,
      gsc_position: kw.position,
      source: 'gsc'
    }));

    // Add Dubai keywords
    const dubaiEnriched = dubaiKeywords
      .filter(kw => !gscKeywords.find(g => g.query === kw))
      .map(kw => ({
        keyword: kw,
        search_volume: volumeMap[kw]?.search_volume || 0,
        competition: volumeMap[kw]?.competition || 0,
        cpc: volumeMap[kw]?.cpc || 0,
        gsc_clicks: 0,
        gsc_impressions: 0,
        gsc_ctr: 0,
        gsc_position: 0,
        source: 'research'
      }));

    const allKeywords = [...enrichedKeywords, ...dubaiEnriched];

    // Insert or upsert
    const { error } = await supabase
      .from('seo_keywords')
      .upsert(allKeywords.map(k => ({
        ...k,
        updated_at: new Date().toISOString()
      })), {
        onConflict: 'keyword'
      });

    if (error) {
      console.error('❌ Error saving:', error);
      throw error;
    }

    console.log(`✅ Saved ${allKeywords.length} keywords to Supabase`);
    
    // Stats
    const topByVolume = [...allKeywords]
      .sort((a, b) => (b.search_volume || 0) - (a.search_volume || 0))
      .slice(0, 10);

    console.log('\n🏆 Top 10 by Search Volume:');
    topByVolume.forEach((kw, i) => {
      console.log(`  ${i+1}. "${kw.keyword}" — ${kw.search_volume} vol, pos: ${kw.gsc_position || 'N/A'}`);
    });

  } catch (error) {
    console.error('❌ Error in saveKeywords:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Starting DataForSEO keyword research...\n');

    // Get keywords
    const gscKeywords = await fetchGSCKeywords();
    const dubaiKeywords = await generateDubaiKeywords();
    
    const allKeywords = [
      ...gscKeywords.map(k => k.query),
      ...dubaiKeywords
    ];

    // Remove duplicates and limit
    const uniqueKeywords = [...new Set(allKeywords)].slice(0, 100);

    // Get volumes
    const volumeMap = await getSearchVolumes(uniqueKeywords);

    // Save to Supabase
    await saveKeywords(gscKeywords, dubaiKeywords, volumeMap);

    console.log('\n✅ DataForSEO sync complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
}

main();
