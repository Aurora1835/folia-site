// build.js — Inject Netlify env vars into HTML at build time

const fs = require('fs');
const path = require('path');

// Read the HTML file
const htmlPath = path.join(__dirname, 'sitter-brief.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Create a script that sets window variables from env
const envInjection = `
<script>
  // Injected at build time by build.js
  window.REACT_APP_SUPABASE_URL = '${process.env.REACT_APP_SUPABASE_URL || ''}';
  window.REACT_APP_SUPABASE_ANON_KEY = '${process.env.REACT_APP_SUPABASE_ANON_KEY || ''}';
</script>
`;

// Inject before the closing </head> tag
html = html.replace('</head>', envInjection + '</head>');

// Write back
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✅ Env vars injected into sitter-brief.html');
