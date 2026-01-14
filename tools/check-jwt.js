#!/usr/bin/env node
/**
 * JWT Token Checker
 * Decodes JWT from cookies and checks expiration
 */

import fs from 'fs';

function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode the payload (second part)
    const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
    return JSON.parse(payload);
  } catch (err) {
    return null;
  }
}

function checkCookies(cookiesPath) {
  console.log('🔐 JWT TOKEN CHECKER\n');
  console.log('═'.repeat(60) + '\n');

  // Load cookies
  let cookies;
  try {
    const cookiesData = fs.readFileSync(cookiesPath, 'utf-8');
    cookies = JSON.parse(cookiesData);
    console.log(`✅ Loaded ${cookies.length} cookies\n`);
  } catch (err) {
    console.error(`❌ Error loading cookies: ${err.message}`);
    process.exit(1);
  }

  // Find the m_a cookie (JWT token)
  const maCookie = cookies.find(c => c.name === 'm_a');

  if (!maCookie) {
    console.log('❌ No "m_a" cookie found (this contains the JWT token)\n');
    console.log('💡 Make sure you\'re exporting from GoHighLevel while logged in.\n');
    process.exit(1);
  }

  console.log('📋 Found m_a cookie (JWT auth token)\n');

  // Decode the JWT
  const jwt = decodeJWT(maCookie.value);

  if (!jwt) {
    console.log('❌ Failed to decode JWT token\n');
    console.log('Cookie value:', maCookie.value.substring(0, 50) + '...\n');
    process.exit(1);
  }

  console.log('✅ JWT decoded successfully\n');
  console.log('JWT Payload:');
  console.log(JSON.stringify(jwt, null, 2));
  console.log('');

  // Check expiration
  if (!jwt.exp) {
    console.log('⚠️  No expiration found in JWT\n');
    return;
  }

  const now = Date.now() / 1000; // Current time in seconds
  const expiresAt = jwt.exp;
  const issuedAt = jwt.iat || 0;

  const expiresDate = new Date(expiresAt * 1000);
  const issuedDate = new Date(issuedAt * 1000);
  const nowDate = new Date();

  const timeLeft = expiresAt - now; // seconds
  const minutesLeft = Math.floor(timeLeft / 60);
  const hoursLeft = (timeLeft / 3600).toFixed(2);

  console.log('═'.repeat(60));
  console.log('\n⏰ JWT EXPIRATION CHECK\n');
  console.log(`Current time:  ${nowDate.toISOString()}`);
  console.log(`Issued at:     ${issuedDate.toISOString()}`);
  console.log(`Expires at:    ${expiresDate.toISOString()}`);
  console.log('');

  if (timeLeft > 0) {
    console.log(`✅ JWT is VALID`);
    console.log(`   Time remaining: ${minutesLeft} minutes (${hoursLeft} hours)\n`);

    if (minutesLeft < 5) {
      console.log('⚠️  WARNING: Less than 5 minutes remaining!');
      console.log('   You should export fresh cookies ASAP.\n');
    } else {
      console.log('✅ You can use these cookies now!\n');
    }
  } else {
    const minutesAgo = Math.abs(Math.floor(timeLeft / 60));
    const hoursAgo = Math.abs((timeLeft / 3600).toFixed(2));

    console.log(`❌ JWT is EXPIRED`);
    console.log(`   Expired ${minutesAgo} minutes ago (${hoursAgo} hours)\n`);

    console.log('═'.repeat(60));
    console.log('\n💡 HOW TO FIX:\n');
    console.log('1. Go to GoHighLevel in your browser');
    console.log('2. Make sure you\'re logged in RIGHT NOW');
    console.log('3. Open Cookie-Editor extension');
    console.log('4. Click "Export" button');
    console.log('5. Give me the fresh cookies IMMEDIATELY');
    console.log('6. Run extraction within 5 minutes\n');
    console.log('Note: GoHighLevel JWT tokens expire after 1 hour\n');
  }

  // Also check the 'a' cookie
  const aCookie = cookies.find(c => c.name === 'a');
  if (aCookie) {
    console.log('═'.repeat(60));
    console.log('\n📋 Also checking "a" cookie (API key)\n');

    // Try to decode (it's base64 JSON)
    try {
      const decoded = Buffer.from(aCookie.value, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      console.log('Content:', JSON.stringify(parsed, null, 2));
      console.log('\n✅ This cookie contains API credentials (doesn\'t expire)\n');
    } catch (err) {
      console.log('⚠️  Could not decode (might not be base64 JSON)\n');
    }
  }
}

// CLI
const cookiesPath = process.argv[2] || 'ghl-cookies.json';

try {
  checkCookies(cookiesPath);
} catch (err) {
  console.error('\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
}
