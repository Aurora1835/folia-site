// Simple in-memory rate limiting (upgrade to Redis for production)
const rateLimits = new Map();

function checkRateLimit(ip, limit = 5, windowMs = 60000) {
  const now = Date.now();
  const userLimits = rateLimits.get(ip) || [];
  const recentRequests = userLimits.filter(time => now - time < windowMs);
  
  if (recentRequests.length >= limit) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimits.set(ip, recentRequests);
  return true;
}

exports.handler = async function(event) {
  // Rate limiting - 5 requests per minute per IP
  const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'];
  if (!checkRateLimit(ip, 5, 60000)) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: 'Too many requests. Please try again later.' })
    };
  }

  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
  const KLAVIYO_LIST_ID = process.env.KLAVIYO_LIST_ID;
  console.log('Klaviyo function called');
  if (!KLAVIYO_API_KEY || !KLAVIYO_LIST_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Klaviyo not configured' }) };
  }
  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  const { email, name } = body;
  console.log('Sending to Klaviyo for:', email);
  try {
    // Step 1: Create or update profile
    const profileRes = await fetch('https://a.klaviyo.com/api/profiles/', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'Content-Type': 'application/json',
        'revision': '2024-02-15'
      },
      body: JSON.stringify({
        data: {
          type: 'profile',
          attributes: {
            email: email,
            first_name: name
          }
        }
      })
    });
    const profileText = await profileRes.text();
    console.log('Profile response status:', profileRes.status);
    const profileData = JSON.parse(profileText);
    const profileId = profileData?.data?.id || profileData?.errors?.[0]?.meta?.duplicate_profile_id;
    console.log('Profile ID:', profileId);
    if (!profileId) {
      return { statusCode: 500, body: JSON.stringify({ error: 'No profile ID' }) };
    }
    // Step 2: Subscribe profile to list with email consent
    const subRes = await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'Content-Type': 'application/json',
        'revision': '2024-02-15'
      },
      body: JSON.stringify({
        data: {
          type: 'profile-subscription-bulk-create-job',
          attributes: {
            profiles: {
              data: [{
                type: 'profile',
                attributes: {
                  email: email
                }
              }]
            }
          },
          relationships: {
            list: {
              data: { type: 'list', id: KLAVIYO_LIST_ID }
            }
          }
        }
      })
    });
    const subText = await subRes.text();
    console.log('Subscription response status:', subRes.status);
    console.log('Subscription response body:', subText);
    // Step 3: Track event that triggers the flow
    const eventRes = await fetch('https://a.klaviyo.com/api/events/', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'Content-Type': 'application/json',
        'revision': '2024-02-15'
      },
      body: JSON.stringify({
        data: {
          type: 'event',
          attributes: {
            profile: {
              data: {
                type: 'profile',
                attributes: { email: email }
              }
            },
            metric: {
              data: {
                type: 'metric',
                attributes: { name: 'Sitter Brief Generated' }
              }
            },
            properties: { 
              family_name: name,
              flow_id: 'TYjWGY'
            }
          }
        }
      })
    });
    console.log('Event response status:', eventRes.status);
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true })
    };
  } catch(e) {
    console.log('Error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
