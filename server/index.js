import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { z } from 'zod';

dotenv.config();

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const app = express();
const upload = multer({ dest: uploadDir });
let client = null;

const allowedOrigins = String(process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const IntentSchema = z.object({
  intent: z.enum([
    'transfer',
    'pay_bill',
    'check_balance',
    'block_card',
    'request_statement',
    'end_session',
    'unknown'
  ]),
  amount: z.number().nullable(),
  recipient: z.string().nullable(),
  source_account: z.enum(['savings', 'current']).nullable(),
  biller: z.string().nullable(),
  statement_period: z.string().nullable(),
  spoken: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  needs_confirmation: z.boolean(),
  clarification_question: z.string().nullable()
});

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 5,
      timeout: 90000 
    });
  }
  return client;
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || origin.endsWith('.github.io') || origin.includes('localhost') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    timestamp: new Date().toISOString()
  });
});

async function transcribeWithRetry(openai, filePath, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      console.log(`[transcribe] Attempt ${i}/${attempts} for ${filePath}`);
      const transcript = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: 'whisper-1'
      });
      return transcript;
    } catch (err) {
      const isNetworkError = err.name === 'APIConnectionError' || 
                             err.message.includes('ECONNRESET') || 
                             err.message.includes('ETIMEDOUT') ||
                             err.message.includes('fetch failed');
      
      console.error(`[transcribe] attempt ${i}/${attempts} failed:`, err.name, err.message);
      
      if (i === attempts || !isNetworkError) throw err;
      
      const delay = i * 3000;
      console.log(`[transcribe] Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  const filePath = req.file?.path;
  const openai = getOpenAIClient();

  if (!openai) {
    if (filePath) fs.unlink(filePath, () => {});
    return res.status(503).json({ error: 'openai_not_configured' });
  }

  if (!filePath) {
    return res.status(400).json({ error: 'missing_file' });
  }

  try {
    req.setTimeout(120000); 
    const transcript = await transcribeWithRetry(openai, filePath);
    return res.json({ text: transcript?.text || '' });
  } catch (err) {
    console.error('[transcribe] final failure:', err);
    return res.status(500).json({ 
      error: 'transcription_failed', 
      details: err.message,
      code: err.code 
    });
  } finally {
    if (filePath) {
      fs.unlink(filePath, (err) => {
        if (err) console.error('[transcribe] unlink failed:', err);
      });
    }
  }
});

app.post('/api/parse-intent', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  const openai = getOpenAIClient();

  if (!openai) return res.status(503).json({ error: 'openai_not_configured' });
  if (!text) return res.status(400).json({ error: 'missing_text' });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a banking intent parser. Return JSON.' },
        { role: 'user', content: text }
      ],
      response_format: { type: 'json_object' }
    });
    const parsed = IntentSchema.parse(JSON.parse(completion.choices[0].message.content));
    return res.json(parsed);
  } catch (err) {
    console.error('[parse-intent] failed:', err);
    return res.status(500).json({ error: 'intent_parse_failed' });
  }
});

const port = Number(process.env.PORT || 3001);
const server = app.listen(port, '0.0.0.0', () => {
  console.log('OpenAI proxy listening on port ' + port);
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
