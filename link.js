if (window.top !== window.self) { document.documentElement.innerHTML = ''; throw new Error('framed'); }
const SB_URL = 'https://wokjsjwtppqcnqyemqyv.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indva2pzand0cHBxY25xeWVtcXl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMjE3NjMsImV4cCI6MjExMDU5Nzc2M30.KKrGGkA9l5sqwcqsTzf9lbvrzv5hRnGoevdotXWClbU';
const $ = id => document.getElementById(id);
function say(t, ok) { $('m').textContent = t; $('m').className = 'm ' + (ok ? 'ok' : 'bad'); }
const token = location.hash.slice(1);
try { history.replaceState(null, '', location.pathname); } catch {}
if (!/^[0-9a-f]{64}$/.test(token)) { $('go').disabled = true; say('This link is incomplete. Open it again from the email.', false); }
$('go').onclick = async () => {
  $('go').disabled = true; say('Sending…', true);
  try {
    const r = await fetch(SB_URL + '/functions/v1/dms', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY }, body: JSON.stringify({ action: 'link', token }), credentials: 'omit', cache: 'no-store' });
    const d = await r.json(); const m = d.message || 'Something went wrong.';
    say(m, r.ok && /^(Thank you|Check-in recorded)/.test(m));
  } catch (e) { $('go').disabled = false; say('Could not reach the server. Check your connection and try again.', false); }
};
