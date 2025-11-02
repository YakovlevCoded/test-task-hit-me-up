# Next Steps - Production Implementation Plan

## Overview

POC доказал что iMessage интеграция работает. Теперь нужно масштабировать решение для production с поддержкой нескольких блоггеров.

**Ключевые задачи:**
1. Multi-user setup (несколько блоггеров на одном Mac)
2. Deployment на MacStadium cloud
3. Onboarding процесс для блоггера (Apple ID login)
4. Backend integration с существующей платформой
5. Production hardening

---

## Phase 1: Multi-User Setup (1-2 weeks)

### Архитектура Multi-Tenant на одном Mac

```
┌──────────────────────────────────────────────────┐
│          MacStadium Mac Mini (16GB)              │
│                                                  │
│  macOS User: blogger1                            │
│  ├── Messages.app (Apple ID: blogger1@...)       │
│  ├── Bot daemon на порту 3001                    │
│  └── Auto-start на login                         │
│                                                  │
│  macOS User: blogger2                            │
│  ├── Messages.app (Apple ID: blogger2@...)       │
│  ├── Bot daemon на порту 3002                    │
│  └── Auto-start на login                         │
│                                                  │
│  ...до 8 users на Mac Mini 16GB                  │
└──────────────────────────────────────────────────┘
```

### 1.1 Создание macOS Users

**Automation Script:** `scripts/create-user.sh`

```bash
#!/bin/bash

# Usage: ./create-user.sh blogger_name port_number

BLOGGER_NAME=$1
PORT_NUMBER=$2
USER_ID=$((500 + PORT_NUMBER - 3000))  # Auto-generate UID

echo "Creating macOS user: $BLOGGER_NAME"

# Create user
sudo dscl . -create /Users/$BLOGGER_NAME
sudo dscl . -create /Users/$BLOGGER_NAME UserShell /bin/bash
sudo dscl . -create /Users/$BLOGGER_NAME RealName "$BLOGGER_NAME"
sudo dscl . -create /Users/$BLOGGER_NAME UniqueID $USER_ID
sudo dscl . -create /Users/$BLOGGER_NAME PrimaryGroupID 20
sudo dscl . -create /Users/$BLOGGER_NAME NFSHomeDirectory /Users/$BLOGGER_NAME

# Set random password (will be changed by blogger)
TEMP_PASSWORD=$(openssl rand -base64 12)
sudo dscl . -passwd /Users/$BLOGGER_NAME $TEMP_PASSWORD

# Create home directory
sudo createhomedir -c -u $BLOGGER_NAME

echo "✓ User created: $BLOGGER_NAME"
echo "✓ Temp password: $TEMP_PASSWORD"
echo "✓ Port assigned: $PORT_NUMBER"
```

**Usage:**
```bash
./scripts/create-user.sh blogger1 3001
./scripts/create-user.sh blogger2 3002
./scripts/create-user.sh blogger3 3003
```

### 1.2 Setup Bot для каждого User

**Automation Script:** `scripts/setup-bot-for-user.sh`

```bash
#!/bin/bash

BLOGGER_NAME=$1
PORT=$2
BLOGGER_ID=$3

echo "Setting up bot for user: $BLOGGER_NAME"

# Copy bot code to user directory
sudo mkdir -p /Users/$BLOGGER_NAME/imessage-bot
sudo cp -r ./imessage-bot-poc/* /Users/$BLOGGER_NAME/imessage-bot/
sudo chown -R $BLOGGER_NAME:staff /Users/$BLOGGER_NAME/imessage-bot

# Create .env for this user
sudo tee /Users/$BLOGGER_NAME/imessage-bot/.env > /dev/null <<EOF
BLUEBUBBLES_URL=http://localhost:1234
BLUEBUBBLES_PASSWORD=supersecret
BOT_PORT=$PORT
BLOGGER_ID=$BLOGGER_ID
BACKEND_WS=wss://backend.hitmeup.fun
EOF

# Install dependencies as user
sudo -u $BLOGGER_NAME bash -c "cd /Users/$BLOGGER_NAME/imessage-bot && npm install"

echo "✓ Bot setup complete for $BLOGGER_NAME on port $PORT"
```

### 1.3 Auto-Start Bot на Login

**LaunchAgent:** `/Users/blogger1/Library/LaunchAgents/com.hitmeup.imessage-bot.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.hitmeup.imessage-bot</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/blogger1/imessage-bot/dist/bot.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/blogger1/imessage-bot</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/blogger1/imessage-bot/logs/bot.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/blogger1/imessage-bot/logs/bot.error.log</string>
</dict>
</plist>
```

**Установка:**
```bash
# As blogger1 user
launchctl load ~/Library/LaunchAgents/com.hitmeup.imessage-bot.plist
launchctl start com.hitmeup.imessage-bot
```

### 1.4 Keep Users Logged In

macOS Fast User Switching позволяет держать всех users залогиненными одновременно:

```bash
# Enable fast user switching
sudo defaults write /Library/Preferences/.GlobalPreferences MultipleSessionEnabled -bool YES

# Disable auto-logout
sudo defaults write /Library/Preferences/com.apple.loginwindow DisableAutoLogout -bool YES

# Disable screen saver auto-lock
defaults -currentHost write com.apple.screensaver idleTime 0
```

**Важно:** Все боты работают в background даже когда user не активен на экране.

---

## Phase 2: MacStadium Deployment (1 week)

### 2.1 Provisioning Mac на MacStadium

**План:**
- Start with 1x Mac Mini M2 (16GB RAM) - $109/month
- Capacity: 8 bloggers comfortably
- Scale: Add more Macs по мере роста

**MacStadium Setup:**
1. Login на https://portal.macstadium.com/
2. Order: Mac Mini M2 (16GB RAM, 256GB SSD)
3. Choose: Managed macOS (они управляют hardware)
4. Configure: SSH access, VNC access для setup
5. Получить: IP address, SSH credentials

**Initial Setup via SSH:**
```bash
# SSH into Mac
ssh admin@mac-instance-ip

# Update macOS
softwareupdate -l
softwareupdate -i -a

# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js v20
brew install nvm
nvm install 20
nvm use 20

# Clone BlueBubbles
cd /opt
git clone https://github.com/BlueBubblesApp/bluebubbles-server.git
cd bluebubbles-server
npm install
```

### 2.2 BlueBubbles Setup на Production Mac

**Headless Mode (без GUI):**

BlueBubbles можно запустить в headless режиме после первоначальной настройки.

**Initial Setup (один раз, через VNC):**
1. Connect через VNC к Mac
2. Запустить BlueBubbles GUI
3. Настроить:
   - Password: `production-secret-password`
   - Port: 1234
   - Enable: Auto-start on boot
   - Disable: Private API
4. Start server
5. Закрыть VNC, server продолжит работать

**Alternative: Config File Setup**

BlueBubbles сохраняет config в `~/Library/Application Support/bluebubbles-server/`:

```bash
# Pre-configure BlueBubbles без GUI
mkdir -p ~/Library/Application Support/bluebubbles-server/
cat > ~/Library/Application Support/bluebubbles-server/config.json <<EOF
{
  "password": "production-secret-password",
  "port": 1234,
  "autoStart": true,
  "privateApi": false,
  "localMode": false
}
EOF
```

### 2.3 Network Configuration

**Firewall Rules:**
```bash
# Allow только internal traffic для BlueBubbles
# Port 1234: только с localhost и VPN
# Ports 3001-3010: bot daemons (internal only)

# Backend должен подключаться через VPN или private network
```

**Architecture:**
```
Internet
   ↓
Backend API (public)
   ↓ VPN/Private Network
MacStadium Mac (private IP)
   ├── BlueBubbles :1234 (internal only)
   └── Bot daemons :3001-3010 (internal only)
```

### 2.4 Monitoring & Alerting

**Health Check Script:** `scripts/health-check.sh`

```bash
#!/bin/bash

# Check all bot daemons
for port in {3001..3010}; do
  response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/health)
  if [ "$response" -eq 200 ]; then
    echo "✓ Bot on port $port: healthy"
  else
    echo "✗ Bot on port $port: DOWN"
    # Send alert to backend/Slack/email
    curl -X POST https://backend.hitmeup.fun/api/alerts \
      -H "Content-Type: application/json" \
      -d "{\"type\": \"bot_down\", \"port\": $port}"
  fi
done

# Check BlueBubbles
bb_response=$(curl -s http://localhost:1234/api/v1/server/info?password=supersecret | jq -r '.status')
if [ "$bb_response" -eq 200 ]; then
  echo "✓ BlueBubbles: healthy"
else
  echo "✗ BlueBubbles: DOWN"
fi
```

**Cron Job:**
```bash
# Run health check every 5 minutes
*/5 * * * * /opt/scripts/health-check.sh
```

---

## Phase 3: Blogger Onboarding - Apple ID Login Process (критично!)

### Проблема
Блоггер должен залогиниться в Messages.app со своим Apple ID на удаленном Mac, но у него нет физического доступа к машине.

### Решение: VNC Access + Временный Доступ

#### 3.1 Onboarding Flow

```
1. Blogger регистрируется на платформе
   ↓
2. Backend создает macOS user на доступном Mac
   ↓
3. Backend генерирует временный VNC URL
   ↓
4. Blogger получает email с инструкциями:
   - VNC URL (временный, expires через 2 часа)
   - Username/password для macOS user
   - Пошаговая инструкция
   ↓
5. Blogger подключается через VNC
   ↓
6. Blogger логинится в Messages.app со своим Apple ID
   ↓
7. Blogger настраивает 2FA (доверенное устройство)
   ↓
8. Backend детектит что Messages.app активен
   ↓
9. Bot daemon auto-starts
   ↓
10. Blogger возвращается в web UI, может отправлять сообщения
```

#### 3.2 Automated Onboarding Script

**Backend API Endpoint:** `POST /api/v1/bloggers/onboard`

```typescript
// Backend implementation
async function onboardBlogger(bloggerId: string, appleId: string) {
  // 1. Find Mac with available capacity
  const mac = await findAvailableMac();

  // 2. Assign port number
  const port = await assignNextAvailablePort(mac.id);

  // 3. Create macOS user on Mac via SSH
  await sshExec(mac.ip, `./scripts/create-user.sh ${bloggerId} ${port}`);

  // 4. Setup bot for user
  await sshExec(mac.ip, `./scripts/setup-bot-for-user.sh ${bloggerId} ${port} ${bloggerId}`);

  // 5. Enable temporary VNC access для этого user
  const vncUrl = await enableVNCAccess(mac.ip, bloggerId);

  // 6. Save mapping в database
  await db.bloggerMacs.create({
    bloggerId,
    macId: mac.id,
    macHost: mac.ip,
    port,
    appleId,
    status: 'pending_setup'
  });

  // 7. Send email с инструкциями
  await sendOnboardingEmail(bloggerId, {
    vncUrl,
    username: bloggerId,
    password: tempPassword,
    expiresIn: '2 hours'
  });

  return { success: true, vncUrl };
}
```

#### 3.3 VNC Access Setup

**macOS Screen Sharing:**
```bash
# Enable screen sharing for specific user
sudo /System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart \
  -activate -configure -access -on \
  -users blogger1 -privs -all -restart -agent
```

**VNC через SSH Tunnel (безопасно):**
```bash
# Blogger подключается через SSH tunnel
ssh -L 5900:localhost:5900 blogger1@mac.hitmeup.internal

# Затем VNC client подключается к localhost:5900
# Или используем web-based VNC (noVNC)
```

**Web-based VNC (рекомендуется):**

Используем **noVNC** для VNC через браузер:
- Deploy noVNC proxy на backend
- Blogger открывает `https://vnc.hitmeup.fun/?token=TEMP_TOKEN`
- Token expires через 2 часа
- Автоматический disconnect после successful setup

#### 3.4 Onboarding Email Template

```
Subject: Welcome to HitMeUp iMessage! Setup Required

Hi {blogger_name},

Your iMessage account is ready! To complete setup, you need to sign in with your Apple ID on our secure Mac server.

IMPORTANT: This is a ONE-TIME setup. Takes ~5 minutes.

Step 1: Connect to Your Mac
Click here: {vnc_url}
(Link expires in 2 hours)

Step 2: Sign into Messages.app
1. Open Messages app (should auto-open)
2. Sign in with YOUR Apple ID
3. Complete 2FA verification
4. You'll see "Messages activated" ✓

Step 3: Done!
Return to HitMeUp dashboard - you can now send iMessages!

Need help? Watch setup video: https://help.hitmeup.fun/imessage-setup

Questions? Reply to this email or contact support@hitmeup.fun

—
HitMeUp Team
```

#### 3.5 Auto-Detection of Successful Setup

**Backend monitoring script:**
```typescript
// Check if Messages.app is activated for user
async function checkMessagesActivation(bloggerId: string) {
  const mapping = await db.bloggerMacs.findOne({ bloggerId });

  // Call bot health check
  const response = await axios.get(
    `http://${mapping.macHost}:${mapping.port}/health`
  );

  // Check if BlueBubbles can access Messages.app
  const bbStatus = await axios.get(
    `http://${mapping.macHost}:${mapping.port}/api/bluebubbles/status`
  );

  if (bbStatus.data.success && bbStatus.data.serverInfo.detected_imessage) {
    // Success! Update status
    await db.bloggerMacs.update(
      { bloggerId },
      { status: 'active', appleIdDetected: bbStatus.data.serverInfo.detected_imessage }
    );

    // Notify blogger
    await sendEmail(bloggerId, 'iMessage Setup Complete! 🎉');

    // Revoke VNC access
    await revokeVNCAccess(mapping.macHost, bloggerId);
  }
}

// Run every 30 seconds during onboarding
setInterval(checkMessagesActivation, 30000);
```

---

## Phase 4: Backend Integration (2 weeks)

### 4.1 Database Schema

```sql
-- Mac fleet inventory
CREATE TABLE mac_fleet (
  id UUID PRIMARY KEY,
  provider VARCHAR(50), -- 'macstadium', 'aws', 'self-hosted'
  hostname VARCHAR(255),
  ip_address VARCHAR(50),
  capacity INTEGER, -- max bloggers (e.g. 8)
  current_usage INTEGER DEFAULT 0,
  status VARCHAR(50), -- 'online', 'offline', 'maintenance'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Blogger to Mac mapping
CREATE TABLE blogger_macs (
  id UUID PRIMARY KEY,
  blogger_id UUID REFERENCES bloggers(id),
  mac_id UUID REFERENCES mac_fleet(id),
  mac_host VARCHAR(255),
  mac_port INTEGER,
  mac_username VARCHAR(255),
  apple_id VARCHAR(255),
  status VARCHAR(50), -- 'pending_setup', 'active', 'error', 'inactive'
  last_health_check TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Message history
CREATE TABLE imessage_messages (
  id UUID PRIMARY KEY,
  blogger_id UUID REFERENCES bloggers(id),
  direction VARCHAR(10), -- 'outbound', 'inbound'
  from_number VARCHAR(50),
  to_number VARCHAR(50),
  message TEXT,
  status VARCHAR(50), -- 'pending', 'sent', 'delivered', 'failed'
  error_message TEXT,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Health check logs
CREATE TABLE mac_health_logs (
  id UUID PRIMARY KEY,
  mac_id UUID REFERENCES mac_fleet(id),
  blogger_id UUID REFERENCES bloggers(id),
  port INTEGER,
  status VARCHAR(50), -- 'healthy', 'unhealthy'
  response_time_ms INTEGER,
  error_message TEXT,
  checked_at TIMESTAMP DEFAULT NOW()
);
```

### 4.2 Provider Abstraction Layer

```typescript
// interfaces/message-provider.ts
export interface MessageProvider {
  sendMessage(bloggerId: string, to: string, message: string): Promise<MessageResult>;
  getStatus(bloggerId: string): Promise<ProviderStatus>;
  onMessageReceived(callback: (message: IncomingMessage) => void): void;
}

export interface MessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ProviderStatus {
  connected: boolean;
  accountId: string;
  lastSeen: Date;
}

// providers/imessage-provider.ts
export class IMessageProvider implements MessageProvider {
  async sendMessage(bloggerId: string, to: string, message: string): Promise<MessageResult> {
    // 1. Find blogger's Mac mapping
    const mapping = await db.bloggerMacs.findOne({
      bloggerId,
      status: 'active'
    });

    if (!mapping) {
      throw new Error('Blogger not configured for iMessage');
    }

    // 2. Send via bot API
    try {
      const response = await axios.post(
        `http://${mapping.macHost}:${mapping.macPort}/api/send`,
        { to, message },
        { timeout: 30000 }
      );

      // 3. Log message
      await db.imessageMessages.create({
        bloggerId,
        direction: 'outbound',
        fromNumber: mapping.appleId,
        toNumber: to,
        message,
        status: 'sent',
        sentAt: new Date()
      });

      return {
        success: true,
        messageId: response.data.blueBubblesResponse.guid
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getStatus(bloggerId: string): Promise<ProviderStatus> {
    const mapping = await db.bloggerMacs.findOne({ bloggerId });

    const response = await axios.get(
      `http://${mapping.macHost}:${mapping.macPort}/health`
    );

    return {
      connected: response.data.status === 'ok',
      accountId: mapping.appleId,
      lastSeen: new Date(response.data.timestamp)
    };
  }
}

// providers/whatsapp-provider.ts
export class WhatsAppProvider implements MessageProvider {
  // Existing WhatsApp implementation
}

// Usage в API:
const providers = {
  whatsapp: new WhatsAppProvider(),
  imessage: new IMessageProvider()
};

app.post('/api/v1/messages/send', async (req, res) => {
  const { bloggerId, provider, to, message } = req.body;

  const result = await providers[provider].sendMessage(bloggerId, to, message);

  res.json(result);
});
```

### 4.3 Routing Logic

**Smart routing:** prefer WhatsApp if available, fallback to iMessage

```typescript
async function sendMessage(bloggerId: string, to: string, message: string) {
  // Check if recipient has WhatsApp
  const hasWhatsApp = await checkWhatsAppAvailability(to);

  if (hasWhatsApp) {
    // Prefer WhatsApp (cheaper, more features)
    return await providers.whatsapp.sendMessage(bloggerId, to, message);
  } else {
    // Fallback to iMessage
    return await providers.imessage.sendMessage(bloggerId, to, message);
  }
}
```

---

## Phase 5: Frontend Integration (1 week)

### 5.1 Blogger Dashboard Updates

**Provider Selection:**
```tsx
// components/MessageComposer.tsx
<Select name="provider" value={provider} onChange={setProvider}>
  <option value="auto">Auto (Smart routing)</option>
  <option value="whatsapp">WhatsApp</option>
  <option value="imessage">iMessage</option>
</Select>
```

**Status Indicators:**
```tsx
// components/ConnectionStatus.tsx
<div className="connection-status">
  <div className="status-item">
    <WhatsAppIcon />
    <span className={whatsappStatus.connected ? 'connected' : 'disconnected'}>
      WhatsApp
    </span>
  </div>

  <div className="status-item">
    <AppleIcon />
    <span className={imessageStatus.connected ? 'connected' : 'disconnected'}>
      iMessage
    </span>
    {!imessageStatus.connected && (
      <button onClick={openOnboarding}>Setup iMessage</button>
    )}
  </div>
</div>
```

### 5.2 Admin Dashboard

**Mac Fleet Management:**
```tsx
// pages/admin/MacFleet.tsx
<Table>
  <thead>
    <tr>
      <th>Mac ID</th>
      <th>Host</th>
      <th>Capacity</th>
      <th>Usage</th>
      <th>Status</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {macs.map(mac => (
      <tr>
        <td>{mac.id}</td>
        <td>{mac.hostname}</td>
        <td>{mac.capacity}</td>
        <td>{mac.currentUsage} / {mac.capacity}</td>
        <td>
          <StatusBadge status={mac.status} />
        </td>
        <td>
          <button onClick={() => viewDetails(mac.id)}>Details</button>
          <button onClick={() => addCapacity(mac.id)}>Add User</button>
        </td>
      </tr>
    ))}
  </tbody>
</Table>
```

---

## Phase 6: Production Hardening (1-2 weeks)

### 6.1 Rate Limiting

```typescript
// middleware/rate-limit.ts
const imessageRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 messages per hour per blogger
  keyGenerator: (req) => req.body.bloggerId,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'You can send up to 50 iMessages per hour',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

app.post('/api/v1/messages/send', imessageRateLimiter, sendMessageHandler);
```

### 6.2 Error Recovery

```typescript
// Auto-retry failed messages
async function sendWithRetry(bloggerId: string, to: string, message: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await providers.imessage.sendMessage(bloggerId, to, message);

      if (result.success) {
        return result;
      }

      // Exponential backoff
      await sleep(Math.pow(2, attempt) * 1000);
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
    }
  }
}
```

### 6.3 Logging & Debugging

```typescript
// Use structured logging
import winston from 'winston';

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'imessage-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'imessage-combined.log' })
  ]
});

// Log all message sends
logger.info('Message sent', {
  bloggerId,
  to,
  messageLength: message.length,
  provider: 'imessage',
  macHost: mapping.macHost,
  port: mapping.macPort,
  responseTime: responseTime
});
```

---

## Timeline Summary

| Phase | Duration | Description |
|-------|----------|-------------|
| **Phase 1** | 1-2 weeks | Multi-user setup automation |
| **Phase 2** | 1 week | MacStadium deployment |
| **Phase 3** | 1-2 weeks | Blogger onboarding flow |
| **Phase 4** | 2 weeks | Backend integration |
| **Phase 5** | 1 week | Frontend integration |
| **Phase 6** | 1-2 weeks | Production hardening |
| **TOTAL** | **7-10 weeks** | Full implementation |

---

## Success Metrics

### Technical KPIs
- ✅ Message delivery rate > 99%
- ✅ Average send latency < 15 seconds
- ✅ Bot uptime > 99.5%
- ✅ Zero Apple ID bans
- ✅ Mac capacity utilization > 80%

### Business KPIs
- ✅ Cost per blogger < $20/month
- ✅ Onboarding completion rate > 90%
- ✅ Time to onboard < 10 minutes
- ✅ Support tickets < 5% of users

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Mac hardware failure | Backup Mac, quick user migration script |
| Apple ID locked | Use blogger's own Apple ID, rate limits |
| Network issues | Health checks, auto-reconnect, alerts |
| Scale bottleneck | Monitor capacity, add Macs proactively |
| VNC security | Temporary tokens, auto-expire, SSH tunnels |

---

## Conclusion

**Ready to scale:** Architecture validated, automation scripts defined, onboarding process designed.

**Next action:** Begin Phase 1 implementation - multi-user setup automation.
