exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
  const KLAVIYO_LIST_ID = process.env.KLAVIYO_LIST_ID;

  if (!KLAVIYO_API_KEY || !KLAVIYO_LIST_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Klaviyo not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } 
  catch(e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { email, name, brief } = body;

  try {
    const res = await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
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
                  email,
                  first_name: name,
                  properties: { sitter_brief: brief }
                }
              }]
            },
            historical_import: false
          },
          relationships: {
            list: {
              data: { type: 'list', id: KLAVIYO_LIST_ID }
            }
          }
        }
      })
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true })
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
