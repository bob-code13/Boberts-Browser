# Bobert's Browser administrator login

The app requires an administrator login before serving the browser or proxy endpoints. The Wisp WebSocket is also authenticated.

## Azure App Service settings (required before deploying)
In Azure Portal → your App Service → Settings → Environment variables → App settings, add:
- `ADMIN_PASSWORD`: a **new unique password with at least 12 characters**. Never commit this value or share it in chat.
- `SESSION_SECRET`: a random secret with **at least 32 characters**, independent of the password (ideally 64+ random characters).

The administrator email is `rilanjia0001@mymail.lausd.net`. This version supports one administrator account, not self-service user registration.

Save settings, restart the App Service, and only then merge/deploy the authentication change. Without valid settings the app fails closed and login is disabled.

Sessions are signed HttpOnly Secure cookies that expire after 12 hours; sign out clears the cookie. Invalid login attempts are rate-limited in memory per instance. This is a basic single-admin login, not a full multiuser identity platform. Use HTTPS and consider Azure Easy Auth / Entra ID for stronger identity management.

**Security:** If you previously shared a password in chat, do not reuse it. Choose a new password directly in Azure.

After deployment, verify unauthenticated `/`, `/scram/`, `/baremux/` and WebSocket `/wisp/` are blocked, then sign in and test browsing.
