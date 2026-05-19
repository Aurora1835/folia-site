const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  
  try {
    const { session_id } = JSON.parse(event.body);
    
    if (!session_id) {
      return { statusCode: 400, body: JSON.stringify({ valid: false, error: 'Missing session_id' }) };
    }
    
    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (session.payment_status !== 'paid') {
      console.log('❌ Payment not completed');
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Payment not completed' }) };
    }
    
    // Extract tier from metadata or use custom field
    const tier = session.client_reference_id ? 
      (session.metadata?.tier || '5') : '5';
    
    console.log('✅ Session verified, tier:', tier);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: true,
        tier: parseInt(tier),
        customer_id: session.customer,
        customer_email: session.customer_details?.email
      })
    };
    
  } catch (err) {
    console.error('Stripe error:', err);
    return { statusCode: 500, body: JSON.stringify({ valid: false, error: err.message }) };
  }
};
