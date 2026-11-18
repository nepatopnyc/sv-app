if (window.top !== window.self) { document.documentElement.innerHTML = ''; throw new Error('framed'); }
const SB_URL = 'https://wokjsjwtppqcnqyemqyv.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indva2pzand0cHBxY25xeWVtcXl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMjE3NjMsImV4cCI6MjExMDU5Nzc2M30.KKrGGkA9l5sqwcqsTzf9lbvrzv5hRnGoevdotXWClbU';
const $ = id => document.getElementById(id);
function say(t, ok) { $('m').textContent = t; $('m').className = 'm ' + (ok ? 'ok' : 'bad'); }
$('go').onclick = async () => {
  const pin = $('pin').value.trim(); if (!/^[0-9]{6,12}$/.test(pin)) return say('Enter your 6 to 12 digit PIN.', false);
  $('go').disabled = true; say('Checking in…', true);
  try {
    const r = await fetch(SB_URL + '/rest/v1/rpc/dms_pin_check_in', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, body: JSON.stringify({ p_pin: pin }), credentials: 'omit', cache: 'no-store' });
    const d = await r.json(); $('pin').value = '';
    if (d === 'ok') say('Checked in ✓ ' + new Date().toLocaleString(), true);
    else if (d === 'locked') say('Too many wrong PINs. PIN check-in is locked for one hour. Use the email link or sign in to the vault.', false);
    else say('Wrong PIN.', false);
  } catch (e) { say('Could not reach the server. Try again.', false); }
  $('go').disabled = false;
};
