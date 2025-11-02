# BlueBubbles Server

⚠️ **This directory should contain the BlueBubbles server code**

BlueBubbles is an external dependency that needs to be cloned separately.

---

## Installation

### Option 1: Clone from GitHub (Recommended for POC)

```bash
cd /Users/leo/Desktop/test-task/imessage-bot-poc/

# Remove this placeholder directory
rm -rf bluebubbles-server

# Clone BlueBubbles
git clone https://github.com/BlueBubblesApp/bluebubbles-server.git
cd bluebubbles-server

# Install dependencies
npm install

# Run server
cd packages/server
npm run start
```

### Option 2: Download Pre-built App (Easier)

For production or if you prefer GUI:

1. Go to https://github.com/BlueBubblesApp/bluebubbles-server/releases
2. Download latest `.dmg` (e.g., `BlueBubbles-1.9.9.dmg`)
3. Install like a normal Mac application
4. Configure through GUI:
   - Set password
   - Port: 1234
   - Disable Private API
   - Start server

---

## Requirements

- **macOS:** 10.15+ (Catalina or later)
- **Node.js:** v20.x (use `nvm install 20 && nvm use 20`)
- **Messages.app:** Configured with Apple ID and iMessage enabled

---

## Configuration

BlueBubbles server should be configured with:

- **Port:** 1234 (default)
- **Password:** Set a secure password (update in `../.env`)
- **Private API:** ❌ Disabled (we use AppleScript mode)
- **Auto Start:** ✅ Enabled

---

## Why BlueBubbles?

BlueBubbles is the bridge between our bot server and Messages.app:

```
Our Bot Server (port 3001)
    ↓ HTTP API calls
BlueBubbles Server (port 1234)
    ↓ AppleScript
Messages.app
    ↓ iMessage Protocol
Apple Servers → Recipient
```

**Key Features:**
- REST API for sending/receiving messages
- AppleScript mode (no SIP disabling required)
- Open source and actively maintained
- Proven in production (4+ years)

---

## Links

- **GitHub:** https://github.com/BlueBubblesApp/bluebubbles-server
- **Documentation:** https://docs.bluebubbles.app/
- **Releases:** https://github.com/BlueBubblesApp/bluebubbles-server/releases

---

## For Production

In production environment, BlueBubbles should:

1. Run on each Mac in the fleet
2. Start automatically on boot (launchd)
3. Be accessible only from localhost or private network
4. Have firewall rules limiting access
5. Use strong password authentication

See `/NEXT_STEPS.md` Phase 2 for production deployment guide.

---

## Troubleshooting

### BlueBubbles won't start
- Check Node.js version: `node --version` (should be v20.x)
- Run `npm install` in bluebubbles-server directory
- Check Messages.app is signed in

### Connection refused
- Verify BlueBubbles server is running: `curl http://localhost:1234/api/v1/server/info?password=YOUR_PASSWORD`
- Check port is not blocked
- Verify password in `.env` matches BlueBubbles

### Permission errors
- Grant Terminal Full Disk Access in System Settings
- System Settings → Privacy & Security → Full Disk Access → Add Terminal

---

**Version:** BlueBubbles v1.9.9 (tested)
**Last Updated:** 2025-11-02
