const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { session_id } = JSON.parse(event.body || '{}');

    if (!session_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing session_id' })
      };
    }

    // Retrieve the Stripe session
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // Check if payment succeeded
    if (session.payment_status !== 'paid') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: false,
          reason: 'Payment not completed'
        })
      };
    }

    // Get the line item to determine tier ($5 or $9)
    const lineItems = await stripe.checkout.sessions.listLineItems(session_id);
    const item = lineItems.data[0];

    if (!item) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: false,
          reason: 'No line items found'
        })
      };
    }

    // Determine tier from price
    // You'll need to update these with YOUR actual price IDs from Stripe
    const PRICE_IDS = {
      5: 'price_1TWLYe4ls6W6YpxG8hM9w4zP',   // UPDATE: Replace with your $5 price ID
      9: 'price_1TGoaB4ls6W6YpxG8xaNWbnO'    // UPDATE: Replace with your $9 price ID
    };

    let tier = null;
    if (item.price.id === PRICE_IDS[5]) tier = 5;
    else if (item.price.id === PRICE_IDS[9]) tier = 9;

    if (!tier) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: false,
          reason: 'Unknown tier'
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        tier: tier,
        customer_email: session.customer_email || session.customer_details?.email,
        session_id: session_id
      })
    };

  } catch (err) {
    console.error('Verify stripe error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
