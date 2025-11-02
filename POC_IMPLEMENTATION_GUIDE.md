# POC Implementation Guide - Local Mac Testing

## Цель POC

Протестировать отправку iMessage через BlueBubbles на локальном Mac и подготовить базу для production решения.

**Timeline:** 2-3 дня
**Requirements:** Mac с macOS, Apple ID, тестовый iPhone/Mac для получения

---

## Phase 1: BlueBubbles Setup (Day 1)

### Step 1: Подготовка Mac

**Prerequisites:**
```bash
# Check macOS version (need 10.15+)
sw_vers

# Check if Messages.app configured
open -a Messages
# Sign in with Apple ID if not already
```

**Configure Messages.app:**
1. Open Messages.app
2. Messages → Settings → iMessage
3. Sign in with Apple ID
4. Enable iMessage
5. Verify phone number/email registered

---

### Step 2: Install BlueBubbles Server

**Option A: Download pre-built (RECOMMENDED для быстрого старта)**

1. Go to https://github.com/BlueBubblesApp/bluebubbles-server/releases
2. Download latest `.dmg` (например `BlueBubbles-1.9.0.dmg`)
3. Install как обычное приложение

**Option B: Build from source**

```bash
# Install Node.js if needed
brew install node

# Clone repo
git clone https://github.com/BlueBubblesApp/bluebubbles-server.git
cd bluebubbles-server

# Install dependencies
npm install

# Build
npm run build

# Run
npm start
```

---

### Step 3: Configure BlueBubbles

1. Launch BlueBubbles Server app
2. **First time setup:**
   - Set server password (запомни его!)
   - Configure port (default: 1234)
   - Enable "Start on Boot" (optional for testing)

3. **Important settings:**
   - Enable "Local Mode" (для тестирования без ngrok)
   - Disable "Private API" (мы не хотим отключать SIP для POC)
   - Enable "Auto Start" Messages.app

4. **Test connectivity:**
   - Server should show status: "Running"
   - Note the local address: `http://localhost:1234`

---

### Step 4: Test BlueBubbles API

**Using curl:**

```bash
# Health check
curl http://localhost:1234/api/v1/health

# Expected response:
{
  "status": "ok",
  "message": "Server is running"
}
```

**Get server info:**
```bash
curl -u YOUR_PASSWORD: http://localhost:1234/api/v1/server/info

# Response includes:
# - macOS version
# - Messages.app version
# - Server version
```

---

### Step 5: Send Test Message via BlueBubbles API

**Using curl:**

```bash
# Send iMessage
curl -X POST http://localhost:1234/api/v1/message/text \
  -H "Content-Type: application/json" \
  -u YOUR_PASSWORD: \
  -d '{
    "chatGuid": "iMessage;-;+1234567890",
    "message": "Test message from BlueBubbles!",
    "method": "apple-script"
  }'
```

**Notes:**
- Replace `+1234567890` with real phone number (должен быть registered в iMessage)
- Format: `iMessage;-;+PHONE` for phone numbers
- Format: `iMessage;-;email@example.com` for email addresses
- `method: "apple-script"` = uses AppleScript (no SIP disable needed)

**Expected response:**
```json
{
  "status": "sent",
  "guid": "message-guid-here"
}
```

**Verify:**
- Check Messages.app - message should appear in conversation
- Check recipient device - message should be received

---

## Phase 2: Custom REST Wrapper (Day 2)

Теперь создадим свой simple wrapper поверх BlueBubbles для более удобного API.

### Step 1: Create Project Structure

```bash
cd /Users/leo/Desktop/test-task
mkdir imessage-bot-poc
cd imessage-bot-poc

# Initialize Node.js project
npm init -y

# Install dependencies
npm install express axios dotenv better-sqlite3 ws
npm install --save-dev @types/node @types/express typescript ts-node nodemon
```

---

### Step 2: Create Bot Server

**File: `src/bot.ts`**

```typescript
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const BLUEBUBBLES_URL = process.env.BLUEBUBBLES_URL || 'http://localhost:1234';
const BLUEBUBBLES_PASSWORD = process.env.BLUEBUBBLES_PASSWORD || '';
const BOT_PORT = parseInt(process.env.BOT_PORT || '3001');
const BLOGGER_ID = process.env.BLOGGER_ID || 'test_blogger';

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    bloggerId: BLOGGER_ID,
    port: BOT_PORT,
    timestamp: new Date().toISOString()
  });
});

// Send message endpoint
app.post('/api/send', async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({
      error: 'Missing required fields: to, message'
    });
  }

  try {
    console.log(`[${BLOGGER_ID}] Sending message to ${to}: "${message}"`);

    // Format chat GUID based on recipient
    const chatGuid = to.includes('@')
      ? `iMessage;-;${to}`
      : `iMessage;-;${to}`;

    // Call BlueBubbles API
    const response = await axios.post(
      `${BLUEBUBBLES_URL}/api/v1/message/text`,
      {
        chatGuid,
        message,
        method: 'apple-script'
      },
      {
        auth: {
          username: BLUEBUBBLES_PASSWORD,
          password: ''
        }
      }
    );

    console.log(`[${BLOGGER_ID}] Message sent successfully:`, response.data);

    res.json({
      success: true,
      bloggerId: BLOGGER_ID,
      to,
      message,
      blueBubblesResponse: response.data
    });

  } catch (error: any) {
    console.error(`[${BLOGGER_ID}] Error sending message:`, error.message);

    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

// Get recent messages (read from Messages database)
app.get('/api/messages/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string || '10');

    // Call BlueBubbles API to get chats
    const response = await axios.get(
      `${BLUEBUBBLES_URL}/api/v1/message`,
      {
        params: { limit, offset: 0 },
        auth: {
          username: BLUEBUBBLES_PASSWORD,
          password: ''
        }
      }
    );

    res.json({
      success: true,
      bloggerId: BLOGGER_ID,
      messages: response.data
    });

  } catch (error: any) {
    console.error(`[${BLOGGER_ID}] Error fetching messages:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(BOT_PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║  iMessage Bot Server                              ║
║  Blogger ID: ${BLOGGER_ID.padEnd(36)} ║
║  Port: ${BOT_PORT.toString().padEnd(42)} ║
║  BlueBubbles: ${BLUEBUBBLES_URL.padEnd(32)} ║
╚═══════════════════════════════════════════════════╝
  `);
});

export default app;
```

---

**File: `.env`**

```bash
BLUEBUBBLES_URL=http://localhost:1234
BLUEBUBBLES_PASSWORD=your_password_here
BOT_PORT=3001
BLOGGER_ID=blogger_test_1
```

---

**File: `package.json`** (update scripts):

```json
{
  "name": "imessage-bot-poc",
  "version": "1.0.0",
  "scripts": {
    "dev": "nodemon --exec ts-node src/bot.ts",
    "build": "tsc",
    "start": "node dist/bot.js"
  }
}
```

---

**File: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

---

### Step 3: Run Bot Server

```bash
# Terminal 1: Make sure BlueBubbles is running
# (it should be running from earlier)

# Terminal 2: Start bot server
npm run dev
```

**Expected output:**
```
╔═══════════════════════════════════════════════════╗
║  iMessage Bot Server                              ║
║  Blogger ID: blogger_test_1                       ║
║  Port: 3001                                       ║
║  BlueBubbles: http://localhost:1234               ║
╚═══════════════════════════════════════════════════╝
```

---

### Step 4: Test Bot Server API

**Terminal 3: Send test messages**

```bash
# Health check
curl http://localhost:3001/health

# Send message
curl -X POST http://localhost:3001/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "message": "Hello from custom bot wrapper!"
  }'

# Expected response:
{
  "success": true,
  "bloggerId": "blogger_test_1",
  "to": "+1234567890",
  "message": "Hello from custom bot wrapper!",
  "blueBubblesResponse": { ... }
}

# Get recent messages
curl http://localhost:3001/api/messages/recent?limit=5
```

---

## Phase 3: Multi-User Testing (Day 2-3)

Теперь протестируем запуск нескольких ботов для разных macOS users.

### Step 1: Create Second macOS User

```bash
# Open System Settings > Users & Groups
# Click (+) to add new user
# Create user: blogger2 / password: test123

# Or via command line:
sudo dscl . -create /Users/blogger2
sudo dscl . -create /Users/blogger2 UserShell /bin/bash
sudo dscl . -create /Users/blogger2 RealName "Blogger 2"
sudo dscl . -create /Users/blogger2 UniqueID 503
sudo dscl . -create /Users/blogger2 PrimaryGroupID 20
sudo dscl . -create /Users/blogger2 NFSHomeDirectory /Users/blogger2
sudo dscl . -passwd /Users/blogger2 test123
sudo createhomedir -c -u blogger2
```

---

### Step 2: Setup Messages.app for User 2

1. **Log in as blogger2** (Fast User Switching или новая сессия)
2. Open Messages.app
3. Sign in with **DIFFERENT Apple ID** (important!)
4. Verify iMessage activated

**Note:** Для полного теста нужны 2 разных Apple IDs. Для POC можно использовать:
- Primary Mac user: твой главный Apple ID
- Secondary user: тестовый Apple ID (или попроси коллегу)

---

### Step 3: Run BlueBubbles for Each User

**Challenge:** BlueBubbles GUI app = one instance per user

**Solutions:**

**Option A: Run BlueBubbles in each user session**
- User 1: BlueBubbles on port 1234
- User 2: BlueBubbles on port 1235 (change в настройках)

**Option B: Build custom lightweight bots (recommended для production)**

Skip BlueBubbles GUI для user 2, вместо этого используем direct AppleScript:

---

### Step 4: Lightweight Bot without BlueBubbles

**File: `src/simple-bot.ts`**

```typescript
import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const app = express();
app.use(express.json());

const BOT_PORT = parseInt(process.env.BOT_PORT || '3002');
const BLOGGER_ID = process.env.BLOGGER_ID || 'blogger_2';

// Send message using pure AppleScript
async function sendMessage(to: string, message: string): Promise<void> {
  // Escape quotes in message
  const escapedMessage = message.replace(/"/g, '\\"').replace(/'/g, "\\'");

  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = iMessage
      set targetBuddy to participant "${to}" of targetService
      send "${escapedMessage}" to targetBuddy
    end tell
  `;

  try {
    const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);
    if (stderr) {
      throw new Error(`AppleScript error: ${stderr}`);
    }
    console.log(`✓ Message sent to ${to}`);
  } catch (error: any) {
    console.error(`✗ Failed to send message:`, error.message);
    throw error;
  }
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    bloggerId: BLOGGER_ID,
    port: BOT_PORT,
    method: 'applescript-direct'
  });
});

app.post('/api/send', async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: 'Missing to or message' });
  }

  try {
    await sendMessage(to, message);

    res.json({
      success: true,
      bloggerId: BLOGGER_ID,
      to,
      message,
      method: 'applescript-direct'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(BOT_PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║  Simple iMessage Bot (AppleScript)                ║
║  Blogger ID: ${BLOGGER_ID.padEnd(36)} ║
║  Port: ${BOT_PORT.toString().padEnd(42)} ║
╚═══════════════════════════════════════════════════╝
  `);
});
```

---

### Step 5: Run Multi-User Test

**As user blogger1:**
```bash
cd /Users/blogger1/imessage-bot-poc
BOT_PORT=3001 BLOGGER_ID=blogger1 npm run dev
```

**As user blogger2 (в отдельной сессии):**
```bash
cd /Users/blogger2/imessage-bot-poc
BOT_PORT=3002 BLOGGER_ID=blogger2 ts-node src/simple-bot.ts
```

**Test both bots:**
```bash
# Test bot 1
curl -X POST http://localhost:3001/api/send \
  -H "Content-Type: application/json" \
  -d '{"to": "+1234567890", "message": "From blogger1!"}'

# Test bot 2
curl -X POST http://localhost:3002/api/send \
  -H "Content-Type: application/json" \
  -d '{"to": "+1234567890", "message": "From blogger2!"}'
```

**Verify:**
- Получатель должен получить 2 сообщения от РАЗНЫХ Apple IDs
- Это доказывает multi-tenant работает!

---

## Phase 4: Backend Integration Prototype (Day 3)

Создадим simple backend mockup для демонстрации полного flow.

### Backend Server

**File: `backend/server.ts`**

```typescript
import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

// Mock blogger -> Mac mapping
const BLOGGER_MAPPING = {
  'blogger_1': { host: 'localhost', port: 3001 },
  'blogger_2': { host: 'localhost', port: 3002 },
};

// Send message on behalf of blogger
app.post('/api/v1/imessage/send', async (req, res) => {
  const { bloggerId, to, message } = req.body;

  if (!bloggerId || !to || !message) {
    return res.status(400).json({
      error: 'Missing required fields: bloggerId, to, message'
    });
  }

  // Find Mac bot for this blogger
  const botConfig = BLOGGER_MAPPING[bloggerId as keyof typeof BLOGGER_MAPPING];
  if (!botConfig) {
    return res.status(404).json({
      error: `No bot configured for blogger ${bloggerId}`
    });
  }

  try {
    // Forward to appropriate bot
    const response = await axios.post(
      `http://${botConfig.host}:${botConfig.port}/api/send`,
      { to, message },
      { timeout: 10000 }
    );

    res.json({
      success: true,
      bloggerId,
      to,
      message,
      botResponse: response.data
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check all bots
app.get('/api/v1/imessage/health', async (req, res) => {
  const healthChecks = await Promise.all(
    Object.entries(BLOGGER_MAPPING).map(async ([bloggerId, config]) => {
      try {
        const response = await axios.get(
          `http://${config.host}:${config.port}/health`,
          { timeout: 3000 }
        );
        return {
          bloggerId,
          status: 'healthy',
          ...response.data
        };
      } catch (error) {
        return {
          bloggerId,
          status: 'unhealthy',
          error: 'Bot not responding'
        };
      }
    })
  );

  res.json({
    timestamp: new Date().toISOString(),
    bots: healthChecks
  });
});

app.listen(8080, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║  Backend API Server                               ║
║  Port: 8080                                       ║
║  Endpoints:                                       ║
║    POST /api/v1/imessage/send                     ║
║    GET  /api/v1/imessage/health                   ║
╚═══════════════════════════════════════════════════╝
  `);
});
```

---

### Test Full Stack

```bash
# Terminal 1: Bot 1
BOT_PORT=3001 BLOGGER_ID=blogger_1 npm run dev

# Terminal 2: Bot 2
BOT_PORT=3002 BLOGGER_ID=blogger_2 ts-node src/simple-bot.ts

# Terminal 3: Backend
cd backend && ts-node server.ts

# Terminal 4: Test
# Check health
curl http://localhost:8080/api/v1/imessage/health

# Send via blogger 1
curl -X POST http://localhost:8080/api/v1/imessage/send \
  -H "Content-Type: application/json" \
  -d '{
    "bloggerId": "blogger_1",
    "to": "+1234567890",
    "message": "Hello from backend API via blogger 1!"
  }'

# Send via blogger 2
curl -X POST http://localhost:8080/api/v1/imessage/send \
  -H "Content-Type: application/json" \
  -d '{
    "bloggerId": "blogger_2",
    "to": "+1234567890",
    "message": "Hello from backend API via blogger 2!"
  }'
```

**Success criteria:**
- ✅ Backend routes to correct bot based on bloggerId
- ✅ Messages sent from different Apple IDs
- ✅ Health check shows all bots online
- ✅ Multi-tenant proof of concept complete!

---

## Phase 5: Resource Monitoring (Day 3)

Измерим resource usage для capacity planning.

### Monitoring Script

**File: `scripts/monitor.sh`**

```bash
#!/bin/bash

echo "=== iMessage Bot Resource Monitoring ==="
echo "Monitoring bot processes every 5 seconds..."
echo "Press Ctrl+C to stop"
echo ""

while true; do
  echo "=== $(date) ==="

  # Find all node/ts-node processes (our bots)
  echo "Bot Processes:"
  ps aux | grep -E "(node|ts-node)" | grep -v grep | awk '{printf "  PID: %s  CPU: %s%%  MEM: %s%%  CMD: %s\n", $2, $3, $4, $11}'

  # Messages.app process
  echo ""
  echo "Messages.app:"
  ps aux | grep "Messages.app" | grep -v grep | awk '{printf "  PID: %s  CPU: %s%%  MEM: %s%%\n", $2, $3, $4}'

  # System totals
  echo ""
  echo "System:"
  top -l 1 | grep "CPU usage"
  top -l 1 | grep "PhysMem"

  echo ""
  echo "---"
  sleep 5
done
```

```bash
chmod +x scripts/monitor.sh
./scripts/monitor.sh
```

**Run load test while monitoring:**

```bash
# Stress test: send 100 messages
for i in {1..100}; do
  curl -X POST http://localhost:8080/api/v1/imessage/send \
    -H "Content-Type: application/json" \
    -d "{\"bloggerId\": \"blogger_1\", \"to\": \"+1234567890\", \"message\": \"Test $i\"}" \
    &
  sleep 0.1
done
```

**Measure:**
- CPU usage per bot
- RAM usage per bot
- Messages.app CPU/RAM
- Total system load

**Expected results (estimate):**
- Bot process: ~50-100MB RAM, 2-5% CPU idle, 10-20% under load
- Messages.app: ~300-500MB RAM per instance
- Total for 2 bots + Messages.app: ~1-1.5GB RAM

---

## Phase 6: Documentation & Handoff

### POC Results Document

**File: `POC_RESULTS.md`**

```markdown
# iMessage Bot POC - Results

## Test Date: 2025-11-XX

## Setup
- Mac: [Your Mac model, RAM, macOS version]
- macOS Users tested: 2
- BlueBubbles version: X.X.X
- Test duration: 3 days

## Tests Performed

### 1. Single Bot Test
- ✅ BlueBubbles installation successful
- ✅ Message sending via API works
- ✅ Message receiving works
- ✅ Latency: ~1-2 seconds

### 2. Multi-User Test
- ✅ 2 macOS users with separate Apple IDs
- ✅ Both bots running concurrently
- ✅ No interference between users
- ✅ Each bot isolated correctly

### 3. Backend Integration Test
- ✅ Backend routes to correct bot
- ✅ Health check monitors all bots
- ✅ Error handling works

### 4. Load Test
- Messages sent: 100
- Success rate: XX%
- Average latency: X seconds
- Failures: X (reasons: ...)

### 5. Resource Usage
- RAM per bot: XXX MB
- CPU per bot: X%
- Messages.app RAM: XXX MB
- Total RAM (2 bots): XXX MB

## Capacity Estimation

Based on POC results:
- Mac Mini 8GB: 4-5 bots comfortably
- Mac Mini 16GB: 8-10 bots comfortably

## Issues Encountered
1. [List any issues]
2. [Solutions applied]

## Recommendations

### For Production:
1. Use lightweight AppleScript bots (not BlueBubbles GUI)
2. Implement proper health monitoring
3. Add rate limiting
4. Setup auto-restart on crash

### Next Steps:
1. Provision MacStadium Mac
2. Implement production bot daemon
3. Build backend integration
4. Test with real bloggers

## Code Artifacts
- Bot server: `/src/bot.ts`
- Simple bot: `/src/simple-bot.ts`
- Backend: `/backend/server.ts`
- Monitoring: `/scripts/monitor.sh`

## Conclusion
✅ POC successful - ready for production implementation
```

---

## Quick Start Commands Summary

```bash
# Setup project
cd /Users/leo/Desktop/test-task
mkdir imessage-bot-poc && cd imessage-bot-poc
npm init -y
npm install express axios dotenv better-sqlite3 ws typescript ts-node nodemon @types/node @types/express

# Create files (copy from guide above):
# - src/bot.ts
# - src/simple-bot.ts
# - backend/server.ts
# - .env
# - tsconfig.json

# Run BlueBubbles
# (Download and install from GitHub releases)

# Run Bot 1 (with BlueBubbles)
BOT_PORT=3001 BLOGGER_ID=blogger_1 npm run dev

# Run Bot 2 (AppleScript direct)
BOT_PORT=3002 BLOGGER_ID=blogger_2 npx ts-node src/simple-bot.ts

# Run Backend
cd backend && npx ts-node server.ts

# Test
curl http://localhost:8080/api/v1/imessage/health
curl -X POST http://localhost:8080/api/v1/imessage/send \
  -H "Content-Type: application/json" \
  -d '{"bloggerId": "blogger_1", "to": "+1234567890", "message": "Test"}'
```

---

## Troubleshooting

### Issue: Messages.app not sending
**Solution:**
- Verify Apple ID signed in
- Check iMessage activated (green in settings)
- Test manual send first
- Check recipient has iMessage

### Issue: AppleScript permission denied
**Solution:**
```bash
# Grant Terminal full disk access
System Settings > Privacy & Security > Full Disk Access > Add Terminal
```

### Issue: Port already in use
**Solution:**
```bash
# Find process using port
lsof -i :3001

# Kill process
kill -9 <PID>
```

### Issue: BlueBubbles connection failed
**Solution:**
- Check BlueBubbles running
- Verify password in .env
- Check firewall settings

---

## Next Steps After POC

1. ✅ Validate multi-tenant works
2. ✅ Measure resource capacity
3. ✅ Prove concept feasibility
4. ⏭️ Build production bot daemon
5. ⏭️ Implement backend provider abstraction
6. ⏭️ Deploy to MacStadium
7. ⏭️ Test with real bloggers

---

**POC Status:** Ready to start ✅

**Estimated POC Time:** 2-3 days

**Blockers:** None (все инструменты доступны)

Let's build! 🚀
