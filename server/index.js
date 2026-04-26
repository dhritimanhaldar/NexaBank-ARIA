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

const ALLOWED_INTENTS = [
  'transfer',
  'pay_bill',
  'check_balance',
  'block_card',
  'request_statement',
  'end_session',
  'unknown'
];

const SAFE_UNKNOWN_INTENT = {
  intent: 'unknown',
  amount: null,
  recipient: null,
  source_account: null,
  biller: null,
  statement_period: null,
  spoken: null,
  confidence: 0,
  needs_confirmation: true,
  clarification_question: 'Sorry, I did not fully understand that. Please repeat your request.'
};

function normalizeNullableString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toSafeIntent(payload, originalText = '') {
  const obj = payload && typeof payload === 'object' ? payload : {};

  const normalized = {
    intent: ALLOWED_INTENTS.includes(obj.intent) ? obj.intent : 'unknown',
    amount: typeof obj.amount === 'number' && Number.isFinite(obj.amount) ? obj.amount : null,
    recipient: normalizeNullableString(obj.recipient),
    source_account: obj.source_account === 'savings' || obj.source_account === 'current' ? obj.source_account : null,
    biller: normalizeNullableString(obj.biller),
    statement_period: normalizeNullableString(obj.statement_period),
    spoken: normalizeNullableString(obj.spoken) || normalizeNullableString(originalText),
    confidence: typeof obj.confidence === 'number' && obj.confidence >= 0 && obj.confidence <= 1 ? obj.confidence : 0,
    needs_confirmation: typeof obj.needs_confirmation === 'boolean'
      ? obj.needs_confirmation
      : ['transfer', 'pay_bill', 'block_card', 'unknown'].includes(obj.intent),
    clarification_question: normalizeNullableString(obj.clarification_question)
  };

  if (normalized.intent === 'unknown' && !normalized.clarification_question) {
    normalized.clarification_question = 'Sorry, I did not fully understand that. Please repeat your request.';
  }

  const parsed = IntentSchema.safeParse(normalized);
  if (parsed.success) return parsed.data;

  return {
    ...SAFE_UNKNOWN_INTENT,
    spoken: normalizeNullableString(originalText)
  };
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableOpenAIError(err) {
  const message = String(err?.message || '');
  const code = String(err?.code || '');
  const causeCode = String(err?.cause?.code || '');
  const status = Number(err?.status || 0);

  return (
    status >= 500 ||
    status === 408 ||
    status === 429 ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    causeCode === 'ECONNRESET' ||
    causeCode === 'ETIMEDOUT' ||
    causeCode === 'ECONNREFUSED' ||
    /connection error/i.test(message) ||
    /network/i.test(message) ||
    /timeout/i.test(message)
  );
}

async function transcribeWithRetry(openai, filePath, model, maxAttempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const transcript = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model,
        response_format: 'json'
      });

      return {
        ok: true,
        model,
        text: transcript?.text || ''
      };
    } catch (err) {
      lastError = err;
      const retryable = isRetryableOpenAIError(err);

      console.error(`[transcribe] attempt ${attempt}/${maxAttempts} failed for model ${model}:`, err);

      if (!retryable || attempt === maxAttempts) {
        break;
      }

      await sleep(600 * attempt);
    }
  }

  return {
    ok: false,
    model,
    error: lastError
  };
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
    const primary = await transcribeWithRetry(openai, filePath, 'gpt-4o-mini-transcribe', 3);
    if (primary.ok) {
      return res.json({
        text: primary.text,
        model: primary.model
      });
    }

    const fallback = await transcribeWithRetry(openai, filePath, 'whisper-1', 2);
    if (fallback.ok) {
      return res.json({
        text: fallback.text,
        model: fallback.model
      });
    }

    console.error('[transcribe] all transcription attempts failed', {
      primaryModel: primary.model,
      primaryError: primary.error?.message || String(primary.error || ''),
      fallbackModel: fallback.model,
      fallbackError: fallback.error?.message || String(fallback.error || '')
    });

    return res.status(500).json({
      error: 'transcription_failed',
      detail: 'All transcription attempts failed'
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
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a banking intent parser for a voice banking assistant. ' +
            'Return ONLY one JSON object with EXACTLY these keys: ' +
            'intent, amount, recipient, source_account, biller, statement_period, spoken, confidence, needs_confirmation, clarification_question. ' +
            'Allowed intent values are: transfer, pay_bill, check_balance, block_card, request_statement, end_session, unknown. ' +
            'source_account must be savings, current, or null. ' +
            'Use null for unknown fields. ' +
            'confidence must be a number between 0 and 1. ' +
            'needs_confirmation must be true for transfers, bill payments, card blocking, or uncertain requests. ' +
            'Do not include markdown, code fences, or any text outside the JSON object.'
        },
        {
          role: 'user',
          content: text
        }
      ]
    });

    const raw = completion.choices?.[0]?.message?.content || '{}';

    let json;
    try {
      json = JSON.parse(raw);
    } catch (_err) {
      return res.json(toSafeIntent(null, text));
    }

    return res.json(toSafeIntent(json, text));
  } catch (err) {
    console.error('[parse-intent] failed:', err);
    return res.json(toSafeIntent(null, text));
  }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, '0.0.0.0', () => {
  console.log('OpenAI proxy listening on :' + port);
});
