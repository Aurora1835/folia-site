const https = require('https');

// Rate limiting config
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per hour

exports.handler = async function(event, context) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
  const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // Rate limiting (if Upstash is configured)
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    const userId = body.userId || 'anonymous';
    const rateLimitKey = `rate_limit:${userId}`;

    try {
      // Check current request count
      const countResponse = await fetch(`${UPSTASH_URL}/get/${rateLimitKey}`, {
        headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
      });
      const countData = await countResponse.json();
      const currentCount = countData.result ? parseInt(countDat
