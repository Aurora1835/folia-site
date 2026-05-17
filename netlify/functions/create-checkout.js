// /.netlify/functions/create-checkout.js
// Creates a Stripe Checkout Session for Folia paywall

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { tier } = JSON.parse(event.body);

    // Validate tier
    if (tier !== 5 && tier !== 9) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid tier. Must be 5 or 9.' })
      };
    }

    // Price IDs from Stripe
    const PRICE_IDS = {
      5: 'price_1TWLYe4ls6W6YpxG8hM9w4zP',
      9: 'price_1TGoaB4ls6W6YpxG8xaNWbnO'
    };

    // Determine success URL based on environment
    const origin = event.headers.origin || event.headers.referer || 'https://withfolia.com';
    const successUrl = `${origin}/sitter-brief?session_id={CHECKOUT_SESSION_ID}&tier=${tier}`;
    const cancelUrl = `${origin}/sitter-brief`;

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: tier === 5 ? 'payment' : 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: PRICE_IDS[tier],
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Allow promotion codes
      allow_promotion_codes: true,
      // Collect customer email
      customer_creation: 'always',
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        url: session.url,
        sessionId: session.id
      })
    };

  } catch (error) {
    console.error('Stripe checkout error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to create checkout session',
        details: error.message
      })
    };
  }
};
