if (window.top !== window.self) { document.documentElement.innerHTML = ''; throw new Error('Refusing to run inside a frame'); }
const C = NEXCORE;
const SB_URL = 'https://wokjsjwtppqcnqyemqyv.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indva2pzand0cHBxY25xeWVtcXl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMjE3NjMsImV4cCI6MjExMDU5Nzc2M30.KKrGGkA9l5sqwcqsTzf9lbvrzv5hRnGoevdotXWClbU';
const CHUNK = 8 * 1024 * 1024;
const $ = id => document.getElementById(id);
const te = new TextEncoder();

// ---------- minimal API client (no third-party code) ----------
function makeApi(persist) {
  const KEYNAME = 'nv-session';
  const api = {
    session: null,
    load() { if (!persist) return; try { this.session = JSON.parse(sessionStorage.getItem(KEYNAME) || 'null'); } catch { this.session = null; } },
    save(s) { this.session = s; if (!persist) return; try { s ? sessionStorage.setItem(KEYNAME, JSON.stringify(s)) : sessionStorage.removeItem(KEYNAME); } catch {} },
    setTokens(d) { this.save({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: d.user || (this.session && this.session.user) }); },
    claims() { try { const p = this.session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(atob(p + '='.repeat((4 - p.length % 4) % 4))); } catch { return {}; } },
    async fresh() { const s = this.session; if (!s || Date.now() / 1000 < s.expires_at - 60) return; const d = await this.req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token }, anon: true }); this.setTokens(d); },
    async req(path, o = {}) {
      if (!o.anon) await this.fresh();
      const h = Object.assign({ apikey: SB_KEY, Authorization: 'Bearer ' + (!o.anon && this.session ? this.session.access_token : SB_KEY) }, o.headers || {});
      let body = o.body;
      if (body !== undefined && !(body instanceof Blob)) { h['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
      const r = await fetch(SB_URL + path, { method: o.method || 'GET', headers: h, body, cache: 'no-store', credentials: 'omit' });
      if (o.raw) return r;
      const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!r.ok) { const e = new Error((data && (data.msg || data.message || data.error_description || data.error)) || ('HTTP ' + r.status)); e.status = r.status; throw e; }
      return data;
    },
    signIn(email, password) { return this.req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, anon: true }).then(d => this.setTokens(d)); },
    signUp(email, password, redirect) { return this.req('/auth/v1/signup?redirect_to=' + encodeURIComponent(redirect), { method: 'POST', body: { email, password }, anon: true }); },
    async signOut() { try { await this.req('/auth/v1/logout', { method: 'POST' }); } catch {} this.save(null); },
    user() { return this.req('/auth/v1/user'); },
    enroll(name) { return this.req('/auth/v1/factors', { method: 'POST', body: { factor_type: 'totp', friendly_name: name } }); },
    unenroll(id) { return this.req('/auth/v1/factors/' + id, { method: 'DELETE' }); },
    async verifyTotp(id, code) { const ch = await this.req('/auth/v1/factors/' + id + '/challenge', { method: 'POST', body: {} }); const d = await this.req('/auth/v1/factors/' + id + '/verify', { method: 'POST', body: { challenge_id: ch.id, code } }); this.setTokens(d); },
    rpc(fn, args = {}) { return this.req('/rest/v1/rpc/' + fn, { method: 'POST', body: args }); },
    select(table, q) { return this.req('/rest/v1/' + table + '?' + q); },
    insert(table, row) { return this.req('/rest/v1/' + table, { method: 'POST', body: row, headers: { Prefer: 'return=minimal' } }); },
    patch(table, q, row) { return this.req('/rest/v1/' + table + '?' + q, { method: 'PATCH', body: row, headers: { Prefer: 'return=minimal' } }); },
    del(table, q) { return this.req('/rest/v1/' + table + '?' + q, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); },
    upload(path, bytes, upsert = false) { return this.req('/storage/v1/object/evidence/' + path, { method: 'POST', body: new Blob([bytes], { type: 'application/octet-stream' }), headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': upsert ? 'true' : 'false' } }); },
    async download(path) { const r = await this.req('/storage/v1/object/authenticated/evidence/' + path, { raw: true }); if (!r.ok) throw new Error('HTTP ' + r.status); return new Uint8Array(await r.arrayBuffer()); },
    removeObjects(paths) { return this.req('/storage/v1/object/evidence', { method: 'DELETE', body: { prefixes: paths } }); },
  };
  api.load(); return api;
}
const api = makeApi(true);

let uid = null, kek = null, keysRow = null, mfaFactorId = null, items = [], idleTimer = null, hiddenAt = 0, viewerUrl = null;
function show(id) { document.querySelectorAll('section.screen').forEach(s => s.classList.toggle('hide', s.id !== id)); window.scrollTo(0, 0); }
function msg(id, t, bad) { const e = $(id); e.textContent = t || ''; e.className = 'msg' + (bad ? ' bad' : ''); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function size(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
function when(t) { return new Date(t).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.l = btn.textContent; btn.textContent = label || 'Working…'; btn.disabled = true; } else { btn.textContent = btn.dataset.l || btn.textContent; btn.disabled = false; } }
function saveBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000); }

// ---------- locking (#10) ----------
function lockVault() {
  kek = null; items = [];
  $('list').innerHTML = ''; $('viewer').innerHTML = ''; $('viewer').classList.add('hide'); $('test-out').innerHTML = ''; $('log-out').innerHTML = '';
  if (viewerUrl) { URL.revokeObjectURL(viewerUrl); viewerUrl = null; }
  route();
}
function lockSoon() { clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (kek) lockVault(); }, 10 * 60 * 1000); }
['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, lockSoon, { passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (kek && hiddenAt && Date.now() - hiddenAt > 2 * 60 * 1000) lockVault();
});

// ---------- routing ----------
async function route() {
  try {
    if (!api.session) { uid = null; kek = null; return show('s-auth'); }
    const user = await api.user(); uid = user.id; $('who').textContent = user.email;
    const verified = (user.factors || []).filter(f => f.factor_type === 'totp' && f.status === 'verified');
    if (!verified.length) return startEnroll(user);
    if (api.claims().aal !== 'aal2') { mfaFactorId = verified[0].id; $('mfa-enroll').classList.add('hide'); $('mfa-title').textContent = 'Enter your 6-digit authenticator code'; $('mfa-code').value = ''; return show('s-mfa'); }
    const st = await api.rpc('vault_status');
    if (!st.claimed) return show('s-claim');
    if (!st.is_owner) return show('s-notowner');
    const k = await api.select('vault_keys', 'select=*&user_id=eq.' + uid); keysRow = k[0] || null;
    if (!kek) { $('pass-confirm-wrap').classList.toggle('hide', !!keysRow); $('pass-title').textContent = keysRow ? 'Unlock your vault' : 'Create your vault passphrase'; $('pass-btn').textContent = keysRow ? 'Unlock' : 'Create vault'; return show('s-pass'); }
    show('s-vault'); loadList(); showHead(); loadDms();
  } catch (e) {
    if (e.status === 401 || e.status === 403) { api.save(null); }
    msg('auth-msg', 'Cannot reach the vault server right now (' + (e.message || e) + '). Backup files can still be opened below.', true); show('s-auth');
  }
}

// ---------- auth ----------
$('signin').onclick = async () => {
  const b = $('signin'); busy(b, true);
  try { await api.signIn($('email').value.trim(), $('password').value); $('password').value = ''; msg('auth-msg', ''); busy(b, false); route(); }
  catch (e) { busy(b, false); msg('auth-msg', e.message, true); }
};
$('signup').onclick = async () => {
  const email = $('email').value.trim(), pw = $('password').value;
  if (pw.length < 12) return msg('auth-msg', 'Use a password of at least 12 characters.', true);
  const b = $('signup'); busy(b, true);
  try {
    const d = await api.signUp(email, pw, location.href.split('#')[0]);
    busy(b, false);
    if (d && d.access_token) { api.setTokens(d); return route(); }
    msg('auth-msg', 'Check your email and tap the confirmation link. Then come back here and sign in. (If the link opens an error page, your email is still confirmed.)');
  } catch (e) { busy(b, false); msg('auth-msg', e.message, true); }
};
async function startEnroll(user) {
  for (const f of (user.factors || [])) if (f.status !== 'verified') { try { await api.unenroll(f.id); } catch {} }
  const d = await api.enroll('Vault ' + Date.now());
  mfaFactorId = d.id; $('mfa-qr').src = d.totp.qr_code; $('mfa-secret').textContent = d.totp.secret;
  $('mfa-enroll').classList.remove('hide'); $('mfa-title').textContent = 'Turn on 2-factor login'; $('mfa-code').value = ''; show('s-mfa');
}
$('mfa-btn').onclick = async () => {
  const b = $('mfa-btn'); busy(b, true);
  try { await api.verifyTotp(mfaFactorId, $('mfa-code').value.trim()); msg('mfa-msg', ''); busy(b, false); route(); }
  catch (e) { busy(b, false); msg('mfa-msg', 'Code not accepted: ' + e.message, true); }
};
$('claim-btn').onclick = async () => {
  const b = $('claim-btn'); busy(b, true);
  try { const ok = await api.rpc('claim_vault', { p_code: $('claim-code').value.trim() }); busy(b, false); if (ok !== true) return msg('claim-msg', 'Invalid setup code. Setup locks after 10 wrong attempts.', true); $('claim-code').value = ''; route(); }
  catch (e) { busy(b, false); msg('claim-msg', e.message, true); }
};
document.querySelectorAll('.signout').forEach(b => b.onclick = async () => { await api.signOut(); lockVault(); });

// ---------- passphrase ----------
$('pass-btn').onclick = async () => {
  const p = $('pass').value; const b = $('pass-btn');
  if (p.length < 12) return msg('pass-msg', 'Use at least 12 characters. Several random words is best.', true);
  busy(b, true, 'Deriving key…');
  try {
    if (!keysRow) {
      if (p !== $('pass2').value) { busy(b, false); return msg('pass-msg', "Passphrases don't match.", true); }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const k = await C.deriveKek(p, salt, C.ITER); const chk = await C.gcmEnc(k, te.encode('nex-check'));
      await api.insert('vault_keys', { user_id: uid, salt: C.b64(salt), iterations: C.ITER, check_iv: chk.iv, check_ct: chk.ct });
      kek = k; await api.rpc('log_event', { p_action: 'vault_created' });
    } else {
      const k = await C.deriveKek(p, C.unb64(keysRow.salt), keysRow.iterations);
      try { await C.gcmDec(k, { iv: keysRow.check_iv, ct: keysRow.check_ct }); } catch { busy(b, false); return msg('pass-msg', 'Wrong passphrase.', true); }
      kek = k;
    }
    $('pass').value = $('pass2').value = ''; msg('pass-msg', ''); busy(b, false); lockSoon(); route();
  } catch (e) { busy(b, false); msg('pass-msg', e.message || String(e), true); }
};
$('lock').onclick = () => lockVault();

// ---------- upload ----------
async function uploadFile(file, title, note, chunkSize = CHUNK, onProgress = () => {}, extraMeta = {}) {
  const id = crypto.randomUUID(); const fk = await C.newFileKey(); const wrapped = await C.wrapFileKey(kek, fk.raw);
  const h = new C.Sha256(); const n = Math.ceil(file.size / chunkSize);
  for (let i = 0; i < n; i++) {
    const plain = new Uint8Array(await file.slice(i * chunkSize, Math.min(file.size, (i + 1) * chunkSize)).arrayBuffer());
    h.update(plain); const enc = await C.encChunk(fk.key, plain);
    try { await api.upload(`${uid}/${id}/${i}.bin`, enc, false); } catch (e) { throw new Error('Upload failed at part ' + (i + 1) + ': ' + e.message); }
    onProgress((i + 1) / n);
  }
  const sha = h.hex();
  const meta = await C.encJson(fk.key, { name: file.name, type: file.type, size: file.size, lastModified: file.lastModified || null, title, note, ...extraMeta });
  await api.insert('evidence', { id, owner_id: uid, size_bytes: file.size, sha256: sha, chunk_size: chunkSize, chunk_count: n, wrapped_key: wrapped, enc_meta: meta });
  const rowHash = await api.rpc('complete_evidence', { p_id: id });
  return { id, sha, rowHash };
}
$('up-btn').onclick = async () => {
  const files = [...$('up-file').files]; if (!files.length) return msg('up-msg', 'Choose a file first.', true);
  const b = $('up-btn'); busy(b, true, 'Encrypting…');
  try {
    for (let k = 0; k < files.length; k++) {
      const f = files[k];
      const r = await uploadFile(f, $('up-title').value.trim(), $('up-note').value.trim(), CHUNK, p => msg('up-msg', `File ${k + 1} of ${files.length}: ${Math.round(p * 100)}% encrypted and uploaded`));
      const v = await openItem({ id: r.id }, { verifyOnly: true });
      if (!v.ok) throw new Error('Read-back verification failed for ' + f.name);
    }
    msg('up-msg', `Saved and verified ✓ ${files.length} file(s). Original bytes unchanged; fingerprints match. Save a backup file and the new chain fingerprint.`);
    $('up-file').value = ''; $('up-title').value = ''; $('up-note').value = ''; loadList(); showHead();
  } catch (e) { msg('up-msg', 'NOT SAVED: ' + (e.message || e), true); }
  busy(b, false);
};

// ---------- list / open ----------
async function loadList() {
  $('list').innerHTML = '<p class="note">Loading…</p>';
  let data; try { data = await api.select('evidence', 'select=*&status=eq.complete&order=created_at.desc'); } catch (e) { $('list').innerHTML = '<p class="msg bad">' + esc(e.message) + '</p>'; return; }
  items = [];
  for (const e of data) { try { const fk = await C.unwrapFileKey(kek, e.wrapped_key); e.meta = await C.decJson(fk, e.enc_meta); } catch { e.meta = { title: '(cannot decrypt)' }; } items.push(e); }
  const real = items.filter(e => !e.meta.selftest);
  $('count').textContent = `${real.length} item${real.length === 1 ? '' : 's'}`;
  $('list').innerHTML = items.length ? items.map(e => `<div class="item"><div class="grow"><b>${e.meta.selftest ? '🧪 ' : '🔒 '}${esc(e.meta.title || e.meta.name)}</b>
    <small>${esc(e.meta.name || '')} · ${size(e.size_bytes)} · saved ${esc(when(e.created_at))}</small><small class="mono">SHA-256 ${esc(e.sha256.slice(0, 16))}…</small>${e.meta.note ? `<small>${esc(e.meta.note)}</small>` : ''}</div>
    <div class="btns"><button class="btn sm" data-open="${esc(e.id)}">Open</button><button class="btn sec sm" data-bak="${esc(e.id)}">Backup file</button></div></div>`).join('') : '<p class="note">No evidence yet.</p>';
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openItem(items.find(x => x.id === b.dataset.open), { button: b }));
  document.querySelectorAll('[data-bak]').forEach(b => b.onclick = () => exportBackup(items.find(x => x.id === b.dataset.bak), b));
}
async function fetchRaw(e) {
  const parts = [];
  for (let i = 0; i < e.chunk_count; i++) { try { parts.push(await api.download(`${e.owner_id}/${e.id}/${i}.bin`)); } catch (err) { throw new Error('Missing part ' + (i + 1) + ': ' + err.message); } }
  return parts;
}
async function openItem(e, opt = {}) {
  busy(opt.button, true, 'Decrypting…');
  try {
    if (!e.wrapped_key) { const r = await api.select('evidence', 'select=*&id=eq.' + e.id); e = r[0]; if (!e) throw new Error('Not found'); }
    const fk = await C.unwrapFileKey(kek, e.wrapped_key); const meta = await C.decJson(fk, e.enc_meta);
    const raw = await fetchRaw(e); const h = new C.Sha256(); const plain = [];
    for (const r of raw) { const p = await C.decChunk(fk, r); h.update(p); plain.push(p); }
    const ok = h.hex() === e.sha256;
    if (opt.verifyOnly) { busy(opt.button, false); return { ok, e, meta, plain, raw, fk }; }
    await api.rpc('log_event', { p_action: 'evidence_viewed', p_evidence: e.id, p_details: { verified: ok } });
    const blob = new Blob(plain, { type: meta.type || 'application/octet-stream' });
    if (viewerUrl) URL.revokeObjectURL(viewerUrl); viewerUrl = URL.createObjectURL(blob);
    const t = (meta.type || '').split('/')[0];
    const prev = t === 'image' ? `<img src="${viewerUrl}" class="prev" alt="">` : t === 'video' ? `<video src="${viewerUrl}" controls class="prev"></video>` : t === 'audio' ? `<audio src="${viewerUrl}" controls style="width:100%"></audio>` : '<p class="note">Preview not available for this file type. Use Download.</p>';
    $('viewer').innerHTML = `<h2>${esc(meta.title || meta.name)} <button class="btn sec sm" id="v-close">Close</button></h2>
      <p class="${ok ? 'ok' : 'msg bad'}">${ok ? '✓ Fingerprint verified: identical to the original file uploaded on ' + esc(when(e.created_at)) : '✗ FINGERPRINT MISMATCH. Do not rely on this copy.'}</p>
      <small class="mono">SHA-256 ${esc(e.sha256)}</small><small>Original name: ${esc(meta.name)} · ${size(e.size_bytes)}${meta.lastModified ? ' · file date ' + esc(when(meta.lastModified)) : ''}</small>
      ${meta.note ? `<p>${esc(meta.note)}</p>` : ''}${prev}<p><button class="btn" id="v-dl">Download original</button></p>`;
    $('viewer').classList.remove('hide'); $('viewer').scrollIntoView({ behavior: 'smooth' });
    $('v-close').onclick = () => { $('viewer').classList.add('hide'); $('viewer').innerHTML = ''; if (viewerUrl) { URL.revokeObjectURL(viewerUrl); viewerUrl = null; } };
    $('v-dl').onclick = async () => { await api.rpc('log_event', { p_action: 'evidence_downloaded', p_evidence: e.id }); saveBlob(blob, meta.name || 'evidence'); };
  } catch (err) { busy(opt.button, false); if (opt.verifyOnly) return { ok: false, err }; return showError('Could not open: ' + (err.message || err)); }
  busy(opt.button, false);
}
function showError(t) { $('viewer').innerHTML = `<p class="msg bad">${esc(t)}</p>`; $('viewer').classList.remove('hide'); }

// ---------- chain fingerprint (#5: anchor outside the database) ----------
async function showHead() {
  try {
    const ch = await api.rpc('verify_chains');
    const text = `Vault chain fingerprint, ${new Date(ch.checked_at).toISOString()}\nEvidence records: ${ch.evidence_rows}, chain ${ch.evidence_ok ? 'OK' : 'BROKEN'}: ${ch.evidence_head || 'none'}\nActivity log entries: ${ch.audit_rows}, chain ${ch.audit_ok ? 'OK' : 'BROKEN'}: ${ch.audit_head || 'none'}`;
    $('head-out').textContent = text; $('head-out').dataset.text = text;
  } catch (e) { $('head-out').textContent = 'Could not load: ' + e.message; }
}
$('head-copy').onclick = async () => { try { await navigator.clipboard.writeText($('head-out').dataset.text || ''); msg('head-msg', 'Copied. Email it to yourself and your lawyer.'); } catch { msg('head-msg', 'Copy failed. Select the text and copy it.', true); } };

// ---------- backups ----------
async function buildBackup(e, fk) {
  const raw = await fetchRaw(e);
  fk = fk || await C.unwrapFileKey(kek, e.wrapped_key);
  const ch = await api.rpc('verify_chains');
  const facts = { id: e.id, created_at: e.created_at, completed_at: e.completed_at, size_bytes: e.size_bytes, sha256: e.sha256, row_hash: e.row_hash, prev_hash: e.prev_hash, chain_head_at_export: ch.evidence_head, exported_at: new Date().toISOString() };
  const sealed = await C.encJson(fk, facts); // authenticated copy: tampering with the header is detected (#8)
  const header = { format: 'NEXBAK1', ...facts, chunk_size: e.chunk_size, chunk_count: e.chunk_count, wrapped_key: e.wrapped_key, enc_meta: e.enc_meta, sealed, salt: keysRow.salt, iterations: keysRow.iterations };
  return new Blob(C.packBackup(header, raw), { type: 'application/octet-stream' });
}
async function exportBackup(e, btn) {
  busy(btn, true, 'Packing…');
  try { const blob = await buildBackup(e); await api.rpc('log_event', { p_action: 'backup_exported', p_evidence: e.id }); saveBlob(blob, `vault-backup-${e.created_at.slice(0, 10)}-${e.id.slice(0, 8)}.nexbak`); }
  catch (err) { showError('Backup failed: ' + (err.message || err)); }
  busy(btn, false);
}
async function checkBackup(u8, passphrase, unlockedKek, unlockedSalt) {
  const { header, chunks } = C.parseBackup(u8);
  const k = (unlockedKek && header.salt === unlockedSalt && !passphrase) ? unlockedKek : await C.deriveKek(passphrase, C.unb64(header.salt), header.iterations);
  const fk = await C.unwrapFileKey(k, header.wrapped_key); const meta = await C.decJson(fk, header.enc_meta);
  const facts = await C.decJson(fk, header.sealed);
  for (const key of ['id', 'created_at', 'size_bytes', 'sha256', 'row_hash']) if (String(facts[key]) !== String(header[key])) throw new Error('Backup header was altered (' + key + ')');
  const h = new C.Sha256(); const plain = []; for (const c of chunks) { const p = await C.decChunk(fk, c); h.update(p); plain.push(p); }
  if (h.hex() !== facts.sha256) throw new Error('Fingerprint mismatch: the backup is damaged.');
  return { meta, facts, plain };
}
async function restoreFrom(fileInput, passInput, outId, btn) {
  const f = fileInput.files[0]; if (!f) return msg(outId, 'Choose a .nexbak file.', true);
  busy(btn, true, 'Checking…');
  try {
    const { meta, facts, plain } = await checkBackup(new Uint8Array(await f.arrayBuffer()), passInput.value, kek, keysRow && keysRow.salt);
    msg(outId, `✓ Backup verified: "${meta.title || meta.name}" is identical to the original.\nSHA-256 ${facts.sha256}\nSaved in vault: ${when(facts.created_at)}\nRecord fingerprint: ${facts.row_hash}\nSaving the original file…`);
    saveBlob(new Blob(plain, { type: meta.type || 'application/octet-stream' }), meta.name || 'restored');
  } catch (err) { msg(outId, 'Restore failed: ' + (err.name === 'OperationError' ? 'wrong passphrase or damaged file' : (err.message || err)), true); }
  busy(btn, false);
}
$('rs-btn').onclick = () => restoreFrom($('rs-file'), $('rs-pass'), 'rs-msg', $('rs-btn'));
$('rv-btn').onclick = () => restoreFrom($('rv-file'), $('rv-pass'), 'rv-msg', $('rv-btn'));
$('open-restore').onclick = () => show('s-restore');
$('back-auth').onclick = () => show('s-auth');

// ---------- integrity ----------
$('verify-btn').onclick = async () => {
  const b = $('verify-btn'); busy(b, true, 'Checking…'); const out = [];
  try {
    const ch = await api.rpc('verify_chains');
    out.push((ch.evidence_ok ? '✓' : '✗') + ` Evidence record chain (${ch.evidence_rows} records)`);
    out.push((ch.audit_ok ? '✓' : '✗') + ` Activity log chain (${ch.audit_rows} entries)`);
    let bad = 0; for (let i = 0; i < items.length; i++) { msg('verify-msg', `Checking file ${i + 1} of ${items.length}…`); const v = await openItem(items[i], { verifyOnly: true }); if (!v.ok) { bad++; out.push('✗ ' + (items[i].meta.title || items[i].meta.name)); } }
    out.push(bad ? `✗ ${bad} file(s) failed` : `✓ All ${items.length} files decrypt and match their fingerprints`);
    await api.rpc('log_event', { p_action: 'integrity_check', p_details: { ok: !bad && ch.evidence_ok && ch.audit_ok } });
    msg('verify-msg', out.join('\n'), bad || !ch.evidence_ok || !ch.audit_ok); showHead();
  } catch (e) { msg('verify-msg', 'Check failed: ' + (e.message || e), true); }
  busy(b, false);
};
$('log-btn').onclick = async () => {
  try { const data = await api.select('audit_log', 'select=*&order=id.desc&limit=50'); $('log-out').innerHTML = data.map(r => `<div class="item"><span>${esc(r.action.replace(/_/g, ' '))}</span><small>${esc(when(r.at))}</small></div>`).join('') || '<p class="note">Empty.</p>'; }
  catch (e) { msg('log-msg', e.message, true); }
};

// ---------- in-app security tests ----------
async function expectFail(fn) { try { await fn(); return false; } catch { return true; } }
$('test-btn').onclick = async () => {
  const b = $('test-btn'); busy(b, true, 'Testing…'); const R = [];
  const render = () => { $('test-out').innerHTML = R.map(r => `<div class="item"><span>${r.pass ? '✅' : '❌'} ${esc(r.name)}</span><small>${esc(r.detail)}</small></div>`).join(''); };
  const add = (name, pass, detail = '') => { R.push({ name, pass: !!pass, detail }); render(); };
  try {
    const plain = crypto.getRandomValues(new Uint8Array(40000));
    const up = await uploadFile(new File([plain], 'selftest.bin', { type: 'application/octet-stream' }), 'Security self-test ' + new Date().toLocaleString(), 'Automatic test file (random data, not evidence).', 16384, () => {}, { selftest: true });
    add('Encrypt and upload in 3 parts', true, up.id.slice(0, 8));
    const v = await openItem({ id: up.id }, { verifyOnly: true });
    add('Download, decrypt and fingerprint match', v.ok);
    const back = new Uint8Array(v.plain.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of v.plain) { back.set(p, o); o += p.length; }
    add('Original bytes unchanged (no compression or modification)', back.length === plain.length && back.every((x, i) => x === plain[i]));
    let same = 0; for (let i = 0; i < 64; i++) if (v.raw[0][12 + i] === plain[i]) same++;
    add('Stored file is unreadable ciphertext', same < 8 && v.raw[0].length === 16384 + 28, `${same}/64 bytes coincide`);
    add('Wrong passphrase cannot decrypt', await expectFail(async () => { const wk = await C.deriveKek('wrong-' + Math.random(), C.unb64(keysRow.salt), keysRow.iterations); await C.unwrapFileKey(wk, v.e.wrapped_key); }));
    const anon = makeApi(false);
    let anonRows = null; try { anonRows = await anon.select('evidence', 'select=id'); } catch { anonRows = []; }
    add('Stranger (not signed in) sees no evidence records', Array.isArray(anonRows) && anonRows.length === 0);
    add('Stranger cannot download stored files', await expectFail(() => anon.download(`${uid}/${up.id}/0.bin`)));
    add('Stranger cannot read the integrity chain', await expectFail(() => anon.rpc('verify_chains')));
    const overwriteBlocked = await expectFail(() => api.upload(`${uid}/${up.id}/0.bin`, new Uint8Array([1, 2, 3]), true));
    try { await api.removeObjects([`${uid}/${up.id}/1.bin`]); } catch {}
    const editBlocked = await expectFail(() => api.patch('evidence', 'id=eq.' + up.id, { size_bytes: 1 }));
    const deleteBlocked = await expectFail(() => api.del('evidence', 'id=eq.' + up.id));
    const fakeLogBlocked = await expectFail(() => api.rpc('log_event', { p_action: 'evidence_uploaded', p_evidence: up.id }));
    const v2 = await openItem({ id: up.id }, { verifyOnly: true });
    add('Overwriting a stored file is blocked', overwriteBlocked && v2.ok);
    add('Deleting stored files is blocked', v2.ok && v2.raw.length === 3);
    add('Editing or deleting evidence records is blocked', editBlocked && deleteBlocked && v2.e.size_bytes === 40000);
    add('Fake activity-log entries are blocked', fakeLogBlocked);
    const ch = await api.rpc('verify_chains'); add('Tamper-evident chains verify', ch.evidence_ok && ch.audit_ok, `${ch.evidence_rows} records, ${ch.audit_rows} log entries`);
    const al = await api.select('audit_log', 'select=id&evidence_id=eq.' + up.id); add('Upload recorded in activity log', al.length >= 1);
    const blob = await buildBackup(v2.e, v2.fk); const u8 = new Uint8Array(await blob.arrayBuffer());
    const rb = await checkBackup(u8, '', kek, keysRow.salt); add('Backup file restores and verifies', rb.facts.sha256 === v2.e.sha256);
    const { header } = C.parseBackup(u8); const forged = { ...header, created_at: '2000-01-01T00:00:00Z' };
    const forgedBytes = new Uint8Array(await new Blob(C.packBackup(forged, C.parseBackup(u8).chunks)).arrayBuffer());
    add('Altered backup header is detected', await expectFail(() => checkBackup(forgedBytes, '', kek, keysRow.salt)));
    add('2-factor login active for this session', api.claims().aal === 'aal2');
    const passed = R.every(r => r.pass);
    await api.insert('test_runs', { actor: uid, passed, results: R });
    await api.rpc('log_event', { p_action: 'security_test', p_details: { passed } });
    R.push({ name: passed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED: do not upload real evidence yet', pass: passed, detail: '' }); render(); loadList(); showHead();
  } catch (e) { add('Test run stopped: ' + (e.message || e), false); }
  busy(b, false);
};

route();

// ---------- safety switch (server-side monitor; alerts only, never evidence) ----------
const fmtT = t => t ? new Date(t).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
let dmsEditId = null;
async function loadDms() {
  let s; try { s = await api.rpc('dms_status'); } catch (e) { msg('dms-msg', 'Could not load: ' + e.message, true); return; }
  $('dms-state').textContent = s.active ? 'ACTIVE' : 'OFF (testing)';
  const lv = ['all clear', 'reminder sent to you', 'contacts alerted', 'follow-up sent to contacts'][s.level] || '';
  $('dms-summary').textContent = s.active ? `Last check-in ${fmtT(s.last_checkin)}. Next due ${fmtT(s.next_due)}. Status: ${lv}${s.reached_by ? ' (reached by ' + s.reached_by + ')' : ''}.` : 'The switch is off. No alerts will be sent until you activate it after testing.';
  $('s-int').value = String(s.interval_min); $('s-grace').value = String(s.grace_min); $('s-verify').value = String(s.verify_wait_min); $('s-sender').value = s.sender_email || '';
  $('dms-contacts').innerHTML = s.contacts.map(c => `<div class="item"><div class="grow"><b>${esc(c.name)}</b> <span class="${c.confirmed_at ? 'ok' : 'note'}">${c.confirmed_at ? '✓ confirmed' : (c.email ? (c.confirm_sent_at ? 'waiting for confirmation' : 'not confirmed') : 'email needed')}</span>
    <small>${esc(c.email || 'no email')} ${c.phone ? '· ' + esc(c.phone) : ''} ${c.region ? '· ' + esc(c.region) : ''}</small></div>
    <div class="btns"><button class="btn sm sec" data-ce="${esc(c.id)}">Edit</button>${c.email && !c.confirmed_at ? `<button class="btn sm" data-cc="${esc(c.id)}">Send confirmation</button>` : ''}<button class="btn sm sec" data-cr="${esc(c.id)}">Remove</button></div></div>`).join('') || '<p class="note">No contacts.</p>';
  document.querySelectorAll('[data-ce]').forEach(b => b.onclick = () => { const c = s.contacts.find(x => x.id === b.dataset.ce); dmsEditId = c.id; $('c-name').value = c.name; $('c-email').value = c.email || ''; $('c-phone').value = c.phone || ''; $('c-region').value = c.region || ''; $('c-save').textContent = 'Save changes to ' + c.name; $('c-name').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  document.querySelectorAll('[data-cc]').forEach(b => b.onclick = async () => { try { await api.rpc('dms_send_confirm', { p_id: b.dataset.cc }); msg('c-msg', 'Confirmation email queued. It is sent within a minute once Brevo is connected.'); loadDms(); } catch (e) { msg('c-msg', e.message, true); } });
  document.querySelectorAll('[data-cr]').forEach(b => b.onclick = async () => { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Sure?'; return; } try { await api.rpc('dms_remove_contact', { p_id: b.dataset.cr }); loadDms(); } catch (e) { msg('c-msg', e.message, true); } });
  $('dms-outbox').innerHTML = s.outbox.map(o => `<div class="item"><span>${o.test ? '🧪 ' : ''}${esc(o.kind)} → ${esc(o.to_name || '')}</span><small>${o.sent_at ? '✓ delivered to Brevo ' + esc(fmtT(o.sent_at)) : o.error ? '✗ ' + esc(o.error) : '⏳ waiting'}</small></div>`).join('') || 'None yet.';
}
$('dms-checkin').onclick = async () => { try { const t = await api.rpc('dms_check_in'); msg('dms-msg', 'Checked in at ' + fmtT(t) + ' ✓'); loadDms(); } catch (e) { msg('dms-msg', e.message, true); } };
$('c-save').onclick = async () => {
  try { await api.rpc('dms_save_contact', { p_id: dmsEditId, p_name: $('c-name').value, p_email: $('c-email').value, p_phone: $('c-phone').value, p_region: $('c-region').value });
    dmsEditId = null; ['c-name', 'c-email', 'c-phone', 'c-region'].forEach(i => $(i).value = ''); $('c-save').textContent = 'Save contact'; msg('c-msg', 'Saved. If the email changed, send a new confirmation.'); loadDms(); }
  catch (e) { msg('c-msg', e.message, true); }
};
$('s-save').onclick = async () => { try { await api.rpc('dms_save_settings', { p_interval: +$('s-int').value, p_grace: +$('s-grace').value, p_verify: +$('s-verify').value, p_sender: $('s-sender').value.trim() }); msg('s-msg', 'Settings saved.'); loadDms(); } catch (e) { msg('s-msg', e.message, true); } };
$('s-pin-save').onclick = async () => { try { await api.rpc('dms_set_pin', { p_pin: $('s-pin').value.trim() }); $('s-pin').value = ''; msg('s-msg', 'PIN set. Use it on the check-in page.'); } catch (e) { msg('s-msg', e.message, true); } };
$('dms-test').onclick = async () => { try { const n = await api.rpc('dms_test_alert'); msg('dms-act-msg', `Test queued for ${n} confirmed contact(s) and you. Watch "Recent emails" for delivery.`); setTimeout(loadDms, 70000); loadDms(); } catch (e) { msg('dms-act-msg', e.message, true); } };
$('dms-on').onclick = async () => { try { await api.rpc('dms_activate', { p_on: true }); msg('dms-act-msg', 'Safety switch ACTIVE. Your first check-in is recorded now.'); loadDms(); } catch (e) { msg('dms-act-msg', e.message, true); } };
$('dms-off').onclick = async () => { try { await api.rpc('dms_activate', { p_on: false }); msg('dms-act-msg', 'Safety switch turned off. You were emailed a notice.'); loadDms(); } catch (e) { msg('dms-act-msg', e.message, true); } };
