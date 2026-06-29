const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());

const LOG_FILE = path.join(__dirname, 'errors.log');

app.post('/log', (req, res) => {
  const { level = 'ERROR', message, stack, screen, userId, timestamp } = req.body;
  const line = `[${timestamp || new Date().toISOString()}] [${level}] [Screen: ${screen || 'unknown'}] [User: ${userId || 'anon'}]\n  ${message}\n${stack ? '  ' + stack + '\n' : ''}${'─'.repeat(60)}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(line);
  res.json({ ok: true });
});

app.listen(3001, () => console.log('🪵 Log server running on port 3001\n  Watching: ' + LOG_FILE));
