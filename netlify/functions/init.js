exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify({
      supabaseUrl: process.env.REACT_APP_SUPABASE_URL,
      supabaseAnonKey: process.env.REACT_APP_SUPABASE_ANON_KEY
    })
  };
};
