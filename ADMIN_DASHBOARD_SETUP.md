# Admin Dashboard setup

This update adds an admin-only account dashboard at `/admin`. Log in with the existing administrator credentials, click your initials in the top-right corner, and select **Admin Dashboard**. Create accounts with name, email, and password; delete accounts; and view approximate active hours.

## REQUIRED: persistent Azure App Service storage

The accounts and usage totals are saved to `/home/boberts-browser/accounts.json` by default. On Azure App Service for Linux custom containers, set the application setting:

`WEBSITES_ENABLE_APP_SERVICE_STORAGE=true`

This must be configured **before creating accounts** so the `/home` directory persists across restarts and image updates. In Azure Portal → App Service → Settings → Environment variables → App settings, add that setting, save, and restart. Without persistent storage, accounts and hours can disappear after a restart. Do not create accounts until persistence is confirmed.

Existing `ADMIN_PASSWORD` (12+ characters) and `SESSION_SECRET` (32+ characters) must remain set. No user passwords are stored as plaintext: account passwords use individually salted scrypt hashes.

**Single-instance only:** This simple JSON file storage assumes one running app instance; do not scale to multiple instances without replacing it with a transactional database. Back up the data file if you need to preserve accounts and totals.

## Usage definition
The page sends a heartbeat approximately once per minute while the browser tab is visible. The server accumulates up to 60 seconds for consecutive heartbeats no more than 90 seconds apart. This is an approximation of time with the browser open and visible, not precise attention or browsing history. Multiple open tabs can affect accuracy. Totals display in decimal hours (e.g., 1.50 hours).

Deleting a user immediately invalidates their session on the next HTTP request or Wisp upgrade and deletes their usage total. Existing administrator sessions from the previous version will need to log in again because the cookie format changed.
