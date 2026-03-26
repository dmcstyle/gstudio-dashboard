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
const SUPABASE_URL = 'https://tvxkiimxzmnlybvyapnk.supabase.co';
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
