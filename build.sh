#!/bin/bash
set -e
cd "$(dirname "$0")"
V=$(grep -o "VERSION = '[0-9.]*'" src/logic.js | grep -o "[0-9.]*")
{
echo '<title>Karate Event Tracker</title>'
echo '<meta name="description" content="Karate tournament and camp manager: divisions, brackets, WTKF scoring, rings, results.">'
echo '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Zen+Kaku+Gothic+New:wght@700&display=swap">'
echo '<style>'; cat src/style.css; echo '</style>'
echo '<header id="bar" class="bar"></header><nav id="tabs" class="tabs" hidden></nav><main id="main"></main><nav id="bnav" class="bnav" hidden aria-label="Sections"></nav><div id="modal" hidden></div><div id="confirm" hidden></div>'
echo "<script>/* Karate Event Tracker v$V */"
cat src/logic.js
echo '(function () {'
echo "'use strict';"
cat src/app1_core.js src/logos.js src/app0_firebase.js src/app2_views.js src/app3_forms.js src/app4_score.js src/app6_live.js src/app7_public.js src/app8_people.js src/app9_access.js src/app5_actions.js
echo 'init();'
echo '})();'
echo '</script>'
} > dist/index.html
{ echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#17191f"><meta name="apple-mobile-web-app-capable" content="yes"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>'; cat dist/index.html; echo '</body></html>'; } > dist/karate-event-tracker.html
# Vercel/Firebase build: same app + Firebase SDK + config file
mkdir -p vercel
{ echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style>'
  echo '<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js"></script><script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js"></script><script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js"></script>'
  echo '<meta name="theme-color" content="#17191f"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Karate"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icon-180.png"><link rel="icon" href="/icon-192.png">'
  echo '<script src="/firebase-config.js"></script></head><body>'; cat dist/index.html; echo '</body></html>'; } > vercel/index.html
echo "built v$V $(wc -c < dist/index.html) bytes"
