// /.netlify/functions/create-checkout.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { tier } = JSON.parse(event.body);

    if (tier !== 5 && tier !== 9) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid tier. Must be 5 or 9.' })
      };
    }

    const PRICE_IDS = {
      5: 'price_1TWLYe4ls6W6YpxG8hM9w4zP',
      9: 'price_1TGoaB4ls6W6YpxG8xaNWbnO'
    };

    // Get the origin safely
    let origin = 'https://withfolia.com';
    if (event.headers.origin) {
      origin = event.headers.origin;
    } else if (event.headers.referer) {
      origin = new URL(event.headers.referer).origin;
    }

    const successUrl = `${origin}/sitter-brief?session_id={CHECKOUT_SESSION_ID}&tier=${tier}`;
    const cancelUrl = `${origin}/sitter-brief`;

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
      allow_promotion_codes: true,
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
