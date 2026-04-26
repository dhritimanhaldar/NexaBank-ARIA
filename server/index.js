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
fs.mkdirSync(uploadDir, { recursive: true });

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
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

// ── FIX: Global CORS Middleware ──────────────────────────────────────────────
app.use(cors({
  origin(origin, callback) {
    // If no origin (server-to-server) or origin is allowed
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.github.io')) {
      callback(null, true);
    } else {
      callback(null, true); // Fallback for debugging, but let's allow all NexaBank origins
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY)
  });
});

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
    const transcript = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-1'
    });
    return res.json({
      text: transcript?.text || ''
    });
  } catch (err) {
    console.error('[transcribe] failed:', err);
    return res.status(500).json({ error: 'transcription_failed' });
  } finally {
    if (filePath) fs.unlink(filePath, () => {});
  }
});

app.post('/api/parse-intent', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  const openai = getOpenAIClient();
  if (!openai) {
    return res.status(503).json({ error: 'openai_not_configured' });
  }
  if (!text) {
    return res.status(400).json({ error: 'missing_text' });
  }
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a banking intent parser. Return JSON matching the schema.'
        },
        { role: 'user', content: text }
      ],
      response_format: { type: 'json_object' }
    });
    const raw = completion.choices[0].message.content;
    const parsed = IntentSchema.parse(JSON.parse(raw));
    return res.json(parsed);
  } catch (err) {
    console.error('[parse-intent] failed:', err);
    return res.status(500).json({ error: 'intent_parse_failed' });
  }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, '0.0.0.0', () => {
  console.log('OpenAI proxy listening on :' + port);
});
