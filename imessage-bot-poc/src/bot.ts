import express, { Request, Response } from 'express';
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
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    bloggerId: BLOGGER_ID,
    port: BOT_PORT,
    blueBubblesUrl: BLUEBUBBLES_URL,
    timestamp: new Date().toISOString()
  });
});

// Get bot info
app.get('/api/info', (req: Request, res: Response) => {
  res.json({
    bloggerId: BLOGGER_ID,
    port: BOT_PORT,
    method: 'bluebubbles',
    blueBubblesUrl: BLUEBUBBLES_URL,
    endpoints: {
      health: 'GET /health',
      send: 'POST /api/send',
      info: 'GET /api/info',
      bluebubbles: 'GET /api/bluebubbles/status'
    }
  });
});

// Check BlueBubbles status
app.get('/api/bluebubbles/status', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(
      `${BLUEBUBBLES_URL}/api/v1/server/info?password=${BLUEBUBBLES_PASSWORD}`,
      {
        timeout: 5000
      }
    );

    res.json({
      success: true,
      blueBubblesOnline: true,
      serverInfo: response.data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      blueBubblesOnline: false,
      error: error.message,
      hint: 'Make sure BlueBubbles server is running on ' + BLUEBUBBLES_URL
    });
  }
});

// Send message endpoint
app.post('/api/send', async (req: Request, res: Response) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: to, message'
    });
  }

  try {
    console.log(`[${BLOGGER_ID}] Sending message to ${to}: "${message}"`);

    // Format chat GUID based on recipient
    // Phone number: iMessage;-;+1234567890
    // Email: iMessage;-;email@example.com
    const chatGuid = to.includes('@')
      ? `iMessage;-;${to}`
      : `iMessage;-;${to}`;

    // Generate temporary GUID for AppleScript method
    const tempGuid = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    // Call BlueBubbles API
    const response = await axios.post(
      `${BLUEBUBBLES_URL}/api/v1/message/text?password=${BLUEBUBBLES_PASSWORD}`,
      {
        chatGuid,
        message,
        method: 'apple-script',
        tempGuid
      },
      {
        timeout: 30000  // 30 seconds for AppleScript (can be slow)
      }
    );

    console.log(`[${BLOGGER_ID}] Message sent successfully:`, response.data);

    res.json({
      success: true,
      bloggerId: BLOGGER_ID,
      to,
      message,
      blueBubblesResponse: response.data,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error(`[${BLOGGER_ID}] Error sending message:`, error.message);

    let errorDetails = error.message;
    if (error.response) {
      errorDetails = error.response.data;
    }

    res.status(500).json({
      success: false,
      error: error.message,
      details: errorDetails,
      hint: error.code === 'ECONNREFUSED'
        ? 'BlueBubbles server is not running. Start it first!'
        : 'Check BlueBubbles server status'
    });
  }
});

// Get recent messages (via BlueBubbles)
app.get('/api/messages/recent', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string || '10');

    const response = await axios.get(
      `${BLUEBUBBLES_URL}/api/v1/message?password=${BLUEBUBBLES_PASSWORD}&limit=${limit}&offset=0`,
      {
        timeout: 5000
      }
    );

    res.json({
      success: true,
      bloggerId: BLOGGER_ID,
      count: response.data.data?.length || 0,
      messages: response.data.data || []
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
║  iMessage Bot Server (BlueBubbles)                ║
║  Blogger ID: ${BLOGGER_ID.padEnd(36)} ║
║  Port: ${BOT_PORT.toString().padEnd(42)} ║
║  BlueBubbles: ${BLUEBUBBLES_URL.padEnd(32)} ║
╚═══════════════════════════════════════════════════╝

Server is running!

Endpoints:
  - GET  http://localhost:${BOT_PORT}/health
  - GET  http://localhost:${BOT_PORT}/api/info
  - GET  http://localhost:${BOT_PORT}/api/bluebubbles/status
  - POST http://localhost:${BOT_PORT}/api/send
  - GET  http://localhost:${BOT_PORT}/api/messages/recent

Test with curl:
  curl http://localhost:${BOT_PORT}/health
  curl http://localhost:${BOT_PORT}/api/bluebubbles/status
  curl -X POST http://localhost:${BOT_PORT}/api/send \\
    -H "Content-Type: application/json" \\
    -d '{"to": "+1234567890", "message": "Test message"}'

⚠️  IMPORTANT: Make sure BlueBubbles server is running first!
    Download from: https://github.com/BlueBubblesApp/bluebubbles-server/releases

Press Ctrl+C to stop.
  `);
});

export default app;
