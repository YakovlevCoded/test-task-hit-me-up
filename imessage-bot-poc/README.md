# iMessage Bot POC (BlueBubbles)

Proof of concept для отправки iMessage через BlueBubbles API.

---

## Prerequisites

1. **Mac с Messages.app:**
   - iMessage должен быть включен
   - Залогинен с Apple ID
   - Можешь вручную отправлять сообщения

2. **BlueBubbles Server установлен и запущен**

3. **Terminal с Full Disk Access:**
   - System Settings → Privacy & Security → Full Disk Access
   - Добавить Terminal

---

## Installation

### 1. Install BlueBubbles Server

**Скачай:**
```bash
# Открой в браузере:
https://github.com/BlueBubblesApp/bluebubbles-server/releases

# Скачай latest .dmg (например BlueBubbles-1.9.x.dmg)
# Установи как обычное приложение
```

**Настрой:**
1. Запусти BlueBubbles app
2. First time setup:
   - **Password:** Придумай пароль (запомни его!)
   - **Port:** 1234 (default, оставь как есть)
   - **Start on Boot:** можно включить
3. **Important settings:**
   - ✅ Enable "Local Mode"
   - ❌ **Disable "Private API"** (не нужно для POC, не хотим отключать SIP)
   - ✅ Enable "Auto Start Messages.app"
4. **Start Server** - должен показать "Running ✓"

### 2. Setup Bot Project

Проект уже создан в:
```
/Users/leo/Desktop/test-task/imessage-bot-poc
```

Dependencies уже установлены, но если нужно:
```bash
cd /Users/leo/Desktop/test-task/imessage-bot-poc
npm install
```

### 3. Configure .env

Открой файл `.env` и обнови:

```bash
# BlueBubbles Configuration
BLUEBUBBLES_URL=http://localhost:1234
BLUEBUBBLES_PASSWORD=ваш_пароль_из_bluebubbles  # ← ИЗМЕНИ ЭТО!

# Bot Configuration
BOT_PORT=3001
BLOGGER_ID=test_blogger_1
```

**ВАЖНО:** Замени `BLUEBUBBLES_PASSWORD` на пароль который ты установил в BlueBubbles!

---

## Running the Bot

### Start Bot Server

```bash
cd /Users/leo/Desktop/test-task/imessage-bot-poc

# Start bot
npm run dev
```

Ты должен увидеть:
```
╔═══════════════════════════════════════════════════╗
║  iMessage Bot Server (BlueBubbles)                ║
║  Blogger ID: test_blogger_1                       ║
║  Port: 3001                                       ║
║  BlueBubbles: http://localhost:1234               ║
╚═══════════════════════════════════════════════════╝

Server is running!
```

---

## Testing with curl

Открой **новый terminal** (bot должен продолжать работать в первом).

### Test 1: Health Check

```bash
curl http://localhost:3001/health
```

Ожидается:
```json
{
  "status": "ok",
  "bloggerId": "test_blogger_1",
  "port": 3001,
  "blueBubblesUrl": "http://localhost:1234"
}
```

### Test 2: BlueBubbles Status

```bash
curl http://localhost:3001/api/bluebubbles/status
```

Ожидается:
```json
{
  "success": true,
  "blueBubblesOnline": true,
  "serverInfo": { ... }
}
```

Если ошибка "BlueBubbles not running":
- Проверь что BlueBubbles app запущен
- Проверь что Server status = "Running ✓"
- Проверь пароль в .env

### Test 3: Send Test Message

⚠️ **ВАЖНО:** Замени `+1234567890` на НАСТОЯЩИЙ номер телефона:
- К которому у тебя есть доступ (твой второй телефон/Mac)
- С включенным iMessage
- С которым ты уже переписывался (есть в Messages.app)

```bash
curl -X POST http://localhost:3001/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "message": "Test message from BlueBubbles bot!"
  }'
```

**Ожидается:**
```json
{
  "success": true,
  "bloggerId": "test_blogger_1",
  "to": "+1234567890",
  "message": "Test message from BlueBubbles bot!",
  "blueBubblesResponse": {
    "status": "sent",
    "guid": "..."
  }
}
```

**Проверь:**
1. Открой Messages.app
2. Должно быть сообщение в чате с этим номером
3. На устройстве получателя должно прийти сообщение

### Test 4: Get Recent Messages

```bash
curl http://localhost:3001/api/messages/recent?limit=5
```

---

## Troubleshooting

### Error: "ECONNREFUSED"

**Проблема:** BlueBubbles server не запущен

**Решение:**
1. Открой BlueBubbles app
2. Убедись что Server status = "Running ✓"
3. Если не running, нажми "Start Server"

### Error: "Unauthorized" or 401

**Проблема:** Неправильный пароль

**Решение:**
1. Проверь пароль в `.env`
2. Должен совпадать с паролем в BlueBubbles app
3. Перезапусти bot после изменения .env

### Message not sending

**Проверь:**
1. Messages.app открыт и залогинен
2. У тебя есть существующий чат с этим номером
3. Попробуй отправить вручную из Messages.app сначала
4. Номер в формате `+1234567890` (с + и кодом страны)

### Terminal permissions

**Если AppleScript не работает:**
- System Settings → Privacy & Security → Full Disk Access
- Добавь Terminal
- Перезапусти Terminal и bot

---

## API Reference

### GET /health
Проверка статуса бота

### GET /api/info
Информация о боте

### GET /api/bluebubbles/status
Проверка соединения с BlueBubbles

### POST /api/send
Отправить iMessage

**Request:**
```json
{
  "to": "+1234567890",     // или "email@example.com"
  "message": "Your text"
}
```

**Response:**
```json
{
  "success": true,
  "bloggerId": "test_blogger_1",
  "to": "+1234567890",
  "message": "Your text",
  "blueBubblesResponse": { ... }
}
```

### GET /api/messages/recent
Получить последние сообщения

**Query params:**
- `limit` - количество сообщений (default: 10)

---

## Project Structure

```
imessage-bot-poc/
├── src/
│   └── bot.ts              # Main bot server (BlueBubbles)
├── .env                    # Configuration
├── package.json
├── tsconfig.json
└── README.md
```

---

## Testing Checklist

Before testing, make sure:

- [ ] BlueBubbles app downloaded and installed
- [ ] BlueBubbles server running (green "Running ✓")
- [ ] Password set in BlueBubbles
- [ ] Password updated in .env file
- [ ] Messages.app configured with Apple ID
- [ ] iMessage enabled
- [ ] Terminal has Full Disk Access
- [ ] Bot starts without errors (`npm run dev`)
- [ ] Health check works
- [ ] BlueBubbles status check works
- [ ] Have real test phone number ready
- [ ] Can send test message
- [ ] Message appears in Messages.app
- [ ] Recipient receives message

---

## Quick Command Reference

```bash
# Start bot
npm run dev

# In another terminal:
# Health check
curl http://localhost:3001/health

# Check BlueBubbles
curl http://localhost:3001/api/bluebubbles/status

# Send message (replace phone number!)
curl -X POST http://localhost:3001/api/send \
  -H "Content-Type: application/json" \
  -d '{"to": "+1234567890", "message": "Test!"}'

# Get recent messages
curl http://localhost:3001/api/messages/recent?limit=5
```

---

## Next Steps After POC

1. ✅ Validate BlueBubbles integration works
2. ✅ Test message sending
3. ✅ Test message receiving
4. ⏭️ Multi-user testing (multiple macOS users)
5. ⏭️ Backend integration
6. ⏭️ Deploy to MacStadium

---

## Resources

- **BlueBubbles GitHub:** https://github.com/BlueBubblesApp/bluebubbles-server
- **BlueBubbles Docs:** https://docs.bluebubbles.app/
- **Full Architecture:** `/Users/leo/Desktop/test-task/FINAL_ARCHITECTURE.md`
- **POC Guide:** `/Users/leo/Desktop/test-task/POC_IMPLEMENTATION_GUIDE.md`

---

## Support

Проблемы?
1. Проверь Troubleshooting section выше
2. Убедись что BlueBubbles server running
3. Проверь что Messages.app работает (попробуй отправить вручную)
4. Проверь пароль в .env
