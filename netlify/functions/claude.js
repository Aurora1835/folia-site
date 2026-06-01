const https = require('https');

// Rate limiting with Upstash Redis
async function checkRateLimit(userId) {
  const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!REDIS_URL || !REDIS_TOKEN) {
    console.log('Redis not configured, skipping rate limit');
    return { allowed: true };
  }
  
  const key = `folia:ratelimit:${userId}`;
  const limit = 10; // 10 requests per hour
  
  try {
    // Increment counter
    const incrUrl = `${REDIS_URL}/incr/${key}`;
    const incrRes = await fetch(incrUrl, {
      headers: { 'Authorization': `Bearer ${REDIS_TOKEN}` }
    });
    const incrData = await incrRes.json();
    const count = incrData.result;
    
    // Set expiry on first request (3600 seconds = 1 hour)
    if (count === 1) {
      const expireUrl = `${REDIS_URL}/expire/${key}/3600`;
      await fetch(expireUrl, {
        headers: { 'Authorization': `Bearer ${REDIS_TOKEN}` }
      });
    }
    
    // Check if over limit
    if (count > limit) {
      // Get TTL to tell user when they can try again
      const ttlUrl = `${REDIS_URL}/ttl/${key}`;
      const ttlRes = await fetch(ttlUrl, {
        headers: { 'Authorization': `Bearer ${REDIS_TOKEN}` }
      });
      const ttlData = await ttlRes.json();
      const minutesLeft = Math.ceil(ttlData.result / 60);
      
      return {
        allowed: false,
        remaining: 0,
        resetIn: minutesLeft
      };
    }
    
    return {
      allowed: true,
      remaining: limit - count
    };
    
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // If Redis fails, allow the request (fail open)
    return { allowed: true };
  }
}

exports.handler = async function(event, context) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
const authHeader = event.headers['authorization'] || '';
const token = authHeader.replace('Bearer ', '').trim();
if (!token || token.length < 20) {
  return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
}
  // Check rate limit
  const userId = body.userId || 'anonymous';
  const rateLimit = await checkRateLimit(userId);
  
  if (!rateLimit.allowed) {
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Rate limit exceeded',
        message: `You've reached your limit of 10 questions per hour. Try again in ${rateLimit.resetIn} minutes.`,
        resetIn: rateLimit.resetIn
      })
    };
  }

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: body.system || 'You are a helpful assistant.',
    messages: body.messages || []
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'X-RateLimit-Remaining': rateLimit.remaining || 0
            },
            body: JSON.stringify(parsed)
          });
        } catch(e) {
          resolve({
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to parse API response' })
          });
        }
      });
    });

    req.on('error', (e) => {
      resolve({
        statusCode: 500,
        body: JSON.stringify({ error: e.message })
      });
    });

    req.write(payload);
    req.end();
  });
};
