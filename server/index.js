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

app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS: ' + origin));
  }
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
      model: 'gpt-4o-mini-transcribe'
    });

    return res.json({
      text: typeof transcript === 'string' ? transcript : String(transcript?.text || '').trim()
    });
  } catch (err) {
    console.error('[transcribe] failed:', err);
    return res.status(500).json({ error: 'transcription_failed' });
  } finally {
    fs.unlink(filePath, () => {});
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
    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content:
            'You are a banking intent parser for a voice banking assistant. ' +
            'Return only JSON matching the provided schema. ' +
            'Allowed intents: transfer, pay_bill, check_balance, block_card, request_statement, end_session, unknown. ' +
            'Never invent amount, recipient, biller, period, or account if unclear. ' +
            'Use needs_confirmation when the user intent is risky or incomplete. ' +
            'Confidence must be a number between 0 and 1. ' +
            'If unclear, return unknown and include a clarification_question.'
        },
        {
          role: 'user',
          content: text
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          json_schema: {
            name: 'banking_intent',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                intent: {
                  type: 'string',
                  enum: ['transfer', 'pay_bill', 'check_balance', 'block_card', 'request_statement', 'end_session', 'unknown']
                },
                amount: { type: ['number', 'null'] },
                recipient: { type: ['string', 'null'] },
                source_account: { type: ['string', 'null'], enum: ['savings', 'current', null] },
                biller: { type: ['string', 'null'] },
                statement_period: { type: ['string', 'null'] },
                spoken: { type: ['string', 'null'] },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                needs_confirmation: { type: 'boolean' },
                clarification_question: { type: ['string', 'null'] }
              },
              required: [
                'intent',
                'amount',
                'recipient',
                'source_account',
                'biller',
                'statement_period',
                'spoken',
                'confidence',
                'needs_confirmation',
                'clarification_question'
              ]
            }
          }
        }
      }
    });

    const raw = String(response.output_text || '').trim();
    const parsed = IntentSchema.parse(JSON.parse(raw));
    return res.json(parsed);
  } catch (err) {
    console.error('[parse-intent] failed:', err);
    return res.status(500).json({ error: 'intent_parse_failed' });
  }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log('OpenAI proxy listening on :' + port);
});
