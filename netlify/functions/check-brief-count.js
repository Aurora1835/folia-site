const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  
  try {
    const { payment_id, tier } = JSON.parse(event.body);
    
    if (!payment_id || !tier) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing payment_id or tier' }) };
    }
    
    // $9 users (tier 9) have unlimited briefs
    if (tier === 9) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          can_generate: true,
          count: 0,
          limit: null  // unlimited
        })
      };
    }
    
    // $5 users (tier 5) get exactly 1 brief
    const { count, error } = await sb
      .from('briefs_generated')
      .select('*', { count: 'exact', head: true })
      .eq('payment_id', payment_id);
    
    if (error) {
      console.error('Error querying briefs_generated:', error);
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
    
    const limit = 1;
    const can_generate = count < limit;
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        can_generate,
        count,
        limit
      })
    };
    
  } catch (err) {
    console.error('Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
