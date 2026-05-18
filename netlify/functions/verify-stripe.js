const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { session_id } = JSON.parse(event.body);
    
    if (!session_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ valid: false, error: 'No session_id provided' })
      };
    }

    console.log('🔍 Verifying Stripe session:', session_id);
    const session = await stripe.checkout.sessions.retrieve(session_id);
    console.log('✅ Session retrieved:', session.payment_status);

    // Determine tier based on which payment link was used
    // $5 link has amount 500 (cents), $9 link has amount 900 (cents)
    const tier = session.amount_total === 500 ? 5 : 9;
    const isValid = session.payment_status === 'paid';

    const response = {
      valid: isValid,
      tier: tier,
      customer_email: session.customer_email || session.customer_details?.email || '',
      session_id: session_id
    };

    console.log('📤 Returning verification response:', response);

    return {
      statusCode: 200,
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('❌ Stripe verification error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        valid: false, 
        error: error.message 
      })
    };
  }
};
