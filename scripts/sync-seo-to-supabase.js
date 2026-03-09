#!/usr/bin/env node

/**
 * Weekly SEO metrics sync script
 * Fetches data from Google Search Console and saves to Supabase
 */

const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const GSC_KEY_FILE = path.join(__dirname, '../config/gsc-key.json');
const SUPABASE_URL = 'https://ffxuwfkgaujkecnjynwg.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmeHV3ZmtnYXVqa2Vjbmp5bndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTA1NDI4NjIsImV4cCI6MTk4NjE0Mjg2Mn0.4p6JcJLqwEz8j9lUcR5qI5PZzxFSqzR0Vq3ZqYJpXKw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchGSCData() {
  console.log('📊 Fetching GSC data...');

  const auth = new google.auth.GoogleAuth({
    keyFile: GSC_KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });

  const webmaster = google.webmasters('v3');

  try {
    // Fetch last 28 days
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

    const rows = response.data.rows || [];
    
    // Calculate metrics
    const totalKeywords = rows.length;
    const totalClicks = rows.reduce((sum, row) => sum + (row.clicks || 0), 0);
    const totalImpressions = rows.reduce((sum, row) => sum + (row.impressions || 0), 0);
    const avgCTR = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
    const avgPosition = rows.length > 0 
      ? rows.reduce((sum, row) => sum + (row.position || 0), 0) / rows.length 
      : 0;

    // Top query by clicks
    const topQuery = rows.length > 0 
      ? rows.sort((a, b) => (b.clicks || 0) - (a.clicks || 0))[0].keys[0]
      : 'N/A';

    console.log('✅ GSC Data:', {
      totalKeywords,
      totalClicks,
      totalImpressions,
      avgCTR: (avgCTR * 100).toFixed(2) + '%',
      avgPosition: avgPosition.toFixed(2),
      topQuery
    });

    return {
      total_keywords: totalKeywords,
      total_clicks: totalClicks,
      total_impressions: totalImpressions,
      avg_ctr: avgCTR,
      avg_position: avgPosition,
      top_query: topQuery,
      data_json: JSON.stringify(rows.slice(0, 100)) // Save top 100 rows
    };

  } catch (error) {
    console.error('❌ Error fetching GSC data:', error.message);
    throw error;
  }
}

async function saveToDashboard(metrics) {
  console.log('💾 Saving to Supabase...');

  try {
    // Check if table exists, if not create it
    const { error: createError } = await supabase
      .from('seo_metrics')
      .insert([{
        ...metrics,
        created_at: new Date().toISOString(),
      }]);

    if (createError) {
      console.error('❌ Error saving to Supabase:', createError);
      throw createError;
    }

    console.log('✅ Saved to Supabase seo_metrics table');

  } catch (error) {
    console.error('❌ Error in saveToDashboard:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Starting SEO metrics sync...');
    const metrics = await fetchGSCData();
    await saveToDashboard(metrics);
    console.log('✅ Sync complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
}

main();
