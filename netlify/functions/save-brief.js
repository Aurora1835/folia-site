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
    const { payment_id, family_id, brief_type, brief_content } = JSON.parse(event.body);
    
    if (!payment_id || !family_id || !brief_type || !brief_content) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Missing required fields' }) };
    }
    
    // Insert brief record
    const { data, error } = await sb.from('briefs_generated').insert([{
      payment_id,
      family_id,
      brief_type,
      brief_content
    }]).select();
    
    if (error) {
      console.error('Supabase insert error:', error);
      return { statusCode: 500, body: JSON.stringify({ success: false, error: error.message }) };
    }
    
    console.log('✅ Brief saved:', data[0].id);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        id: data[0].id
      })
    };
    
  } catch (err) {
    console.error('Unexpected error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
