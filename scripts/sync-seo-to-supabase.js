#!/usr/bin/env node
/**
 * Weekly SEO metrics sync script
 * Fetches data from Google Search Console - saves to Supabase:
 *   - seo_metrics      : aggregate weekly snapshot
 *   - seo_keywords_history : per-keyword position snapshot
 */

const { google }       = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const GSC_KEY_FILE  = path.join(__dirname, '../config/gsc-key.json');
const SUPABASE_URL  = 'https://tvxkiimxzmnlybvyapnk.supabase.co';
const SUPABASE_KEY  = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2eGtpaW14em1ubHlidnlhcG5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2OTU1MDYsImV4cCI6MjA4ODI3MTUwNn0.xzJh-SbW9cqDTVsbumx2zPo5IkvJfLyrWa-339TBQl4';

const GSC_SITE      = 'sc-domain:dubaimusicstudio.com';
const ROW_LIMIT     = 25000;
const TOP_ROWS_JSON = 200;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchGSCData() {
  console.log('Fetching GSC data...');
  const auth = new google.auth.GoogleAuth({
    keyFile: GSC_KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
  const webmaster = google.webmasters('v3');
  const endDate   = new Date();
  const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const response = await webmaster.searchanalytics.query({
    auth,
    siteUrl: GSC_SITE,
    requestBody: {
      startDate:  startDate.toISOString().split('T')[0],
      endDate:    endDate.toISOString().split('T')[0],
      dimensions: ['query'],
      rowLimit:   ROW_LIMIT,
    },
  });
  const rows = response.data.rows || [];
  console.log('Got ' + rows.length + ' keywords from GSC');
  const totalKeywords    = rows.length;
  const totalClicks      = rows.reduce((s, r) => s + (r.clicks      || 0), 0);
  const totalImpressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);
  const avgCTR           = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgPosition      = rows.length > 0 ? rows.reduce((s, r) => s + (r.position || 0), 0) / rows.length : 0;
  const sorted   = [...rows].sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
  const topQuery = sorted[0] ? sorted[0].keys[0] : 'N/A';
  const byImpressions = [...rows].sort((a, b) => (b.impressions || 0) - (a.impressions || 0));
  const dataJson = JSON.stringify(byImpressions.slice(0, TOP_ROWS_JSON));
  console.log('Metrics: keywords=' + totalKeywords + ' clicks=' + totalClicks + ' impressions=' + totalImpressions);
  return { rows, metrics: {
    total_keywords:    totalKeywords,
    total_clicks:      totalClicks,
    total_impressions: totalImpressions,
    avg_ctr:           avgCTR,
    avg_position:      avgPosition,
    top_query:         topQuery,
    data_json:         dataJson,
  }};
}

async function saveAggregate(metrics) {
  console.log('Saving aggregate snapshot to seo_metrics...');
  const { error } = await supabase
    .from('seo_metrics')
    .insert([{ ...metrics, created_at: new Date().toISOString() }]);
  if (error) { console.error('seo_metrics insert error:', JSON.stringify(error)); throw new Error(JSON.stringify(error)); }
  console.log('Aggregate snapshot saved');
}

async function saveKeywordHistory(rows) {
  const today = new Date().toISOString().split('T')[0];
  console.log('Saving ' + rows.length + ' keywords for ' + today);
  const CHUNK = 500;
  const records = rows.map(function(r) { return {
    keyword:       r.keys[0],
    position:      parseFloat((r.position || 0).toFixed(2)),
    clicks:        r.clicks      || 0,
    impressions:   r.impressions || 0,
    ctr:           parseFloat((r.ctr || 0).toFixed(6)),
    snapshot_date: today,
  }; });
  for (var i = 0; i < records.length; i += CHUNK) {
    var chunk = records.slice(i, i + CHUNK);
    var result = await supabase.from('seo_keywords_history').upsert(chunk, { onConflict: 'keyword,snapshot_date', ignoreDuplicates: true });
    if (result.error) { console.error('seo_keywords_history error:', JSON.stringify(result.error)); throw new Error(JSON.stringify(result.error)); }
    console.log('Saved ' + (i + chunk.length) + '/' + records.length);
  }
  console.log('Keyword history saved');
}

async function main() {
  console.log('Starting SEO metrics sync...');
  try {
    var data = await fetchGSCData();
    await saveAggregate(data.metrics);
    await saveKeywordHistory(data.rows);
    console.log('All done!');
    process.exit(0);
  } catch (err) {
    console.error('Sync failed:', err.message);
    process.exit(1);
  }
}

main();
