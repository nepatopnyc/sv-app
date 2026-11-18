# Secure Vault (client only)

Static web client. **This repository contains no evidence, no passwords and no private keys.**
All files are encrypted in the browser (AES-256-GCM, keys derived from the owner's passphrase with PBKDF2-SHA256, 600,000 iterations) before upload.
Encrypted data is stored in a separate private backend that only the owner can access with 2-factor login.

- `index.html`, `app.js`, `core.js`: the vault app
- `restore.html`: offline backup recovery (no network access)

The API key in `app.js` is the backend's public "anon" key, which is designed to be public. Access is enforced by row-level security on the server.
