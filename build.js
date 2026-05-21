// build.js — Inject Netlify env vars into HTML at build time (memory only)

const fs = require('fs');
const path = require('path');

// Read the HTML file
const htmlPath = path.join(__dirname, 'sitter-brief.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Create a script that references env vars safely
// These are injected by Netlify at deploy time, not hardcoded
const envInjection = `
<script>
  // Netlify injects these env vars at deploy time
  // They are NOT hardcoded in the file
  window.REACT_APP_SUPABASE_URL = '${process.env.REACT_APP_SUPABASE_URL}';
  window.REACT_APP_SUPABASE_ANON_KEY = '${process.env.REACT_APP_SUPABASE_ANON_KEY}';
  console.log('✅ Env vars loaded:', !!window.REACT_APP_SUPABASE_URL);
</script>
`;

// Inject before the closing </head> tag
html = html.replace('</head>', envInjection + '</head>');

// Write to a temporary build output (not committed to repo)
const buildDir = path.join(__dirname, '_build');
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir);

const outputPath = path.join(buildDir, 'sitter-brief.html');
fs.writeFileSync(outputPath, html, 'utf8');

console.log('✅ Build complete: _build/sitter-brief.html');
