import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, getDb } from './database.js';
import { marketDataProvider } from './yahoo-provider.js';
import { extractCompaniesFromText, extractTextFromPdf } from './import-service.js';
import type { FavoriteItem, Transaction } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

// Serve static files from client build
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));

// Initialize database
initDb();

// ===== Portfolio Routes =====

app.get('/api/portfolio', (_req, res) => {
  const db = getDb();
  const items = db.prepare('SELECT * FROM portfolio_items ORDER BY name').all();
  res.json(items);
});

app.post('/api/portfolio', (req, res) => {
  const { ticker, name, exchange, currency } = req.body;
  if (!ticker || !name) {
    return res.status(400).json({ error: 'Ticker and name are required' });
  }
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO portfolio_items (ticker, name, exchange, currency) VALUES (?, ?, ?, ?)'
  ).run(ticker.toUpperCase(), name, exchange || null, currency || null);
  const item = db.prepare('SELECT * FROM portfolio_items WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

app.post('/api/portfolio/batch', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Items array is required' });
  }
  const db = getDb();
  const insert = db.prepare(
    'INSERT INTO portfolio_items (ticker, name, exchange, currency) VALUES (?, ?, ?, ?)'
  );
  const insertMany = db.transaction((items: any[]) => {
    const results = [];
    for (const item of items) {
      if (item.ticker && item.name) {
        const result = insert.run(item.ticker.toUpperCase(), item.name, item.exchange || null, item.currency || null);
        results.push(result.lastInsertRowid);
      }
    }
    return results;
  });
  const ids = insertMany(items);
  const inserted = db.prepare(`SELECT * FROM portfolio_items WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  res.status(201).json(inserted);
});

app.delete('/api/portfolio/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM portfolio_items WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ===== Favorites Routes =====

app.get('/api/favorites', (_req, res) => {
  const db = getDb();
  const items = db.prepare('SELECT * FROM favorite_items ORDER BY name').all() as FavoriteItem[];
  // Attach tags
  const tagStmt = db.prepare('SELECT tag FROM favorite_tags WHERE favorite_id = ?');
  const result = items.map((item) => ({
    ...item,
    tags: (tagStmt.all(item.id) as { tag: string }[]).map((t) => t.tag),
  }));
  res.json(result);
});

app.post('/api/favorites', (req, res) => {
  const { ticker, name, exchange, currency, alarm_price, notes, tags } = req.body;
  if (!ticker || !name) {
    return res.status(400).json({ error: 'Ticker and name are required' });
  }
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO favorite_items (ticker, name, exchange, currency, alarm_price, notes) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(ticker.toUpperCase(), name, exchange || null, currency || null, alarm_price ?? null, notes || null);

  const id = result.lastInsertRowid;
  if (tags && Array.isArray(tags)) {
    const insertTag = db.prepare('INSERT INTO favorite_tags (favorite_id, tag) VALUES (?, ?)');
    for (const tag of tags) {
      if (tag) insertTag.run(id, tag);
    }
  }

  const item = db.prepare('SELECT * FROM favorite_items WHERE id = ?').get(id) as FavoriteItem;
  const itemTags = (db.prepare('SELECT tag FROM favorite_tags WHERE favorite_id = ?').all(id) as { tag: string }[]).map((t) => t.tag);
  res.status(201).json({ ...item, tags: itemTags });
});

app.post('/api/favorites/batch', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Items array is required' });
  }
  const db = getDb();
  const insert = db.prepare(
    'INSERT INTO favorite_items (ticker, name, exchange, currency) VALUES (?, ?, ?, ?)'
  );
  const insertTag = db.prepare('INSERT INTO favorite_tags (favorite_id, tag) VALUES (?, ?)');
  const insertMany = db.transaction((items: any[]) => {
    const ids: any[] = [];
    for (const item of items) {
      if (item.ticker && item.name) {
        const result = insert.run(item.ticker.toUpperCase(), item.name, item.exchange || null, item.currency || null);
        ids.push(result.lastInsertRowid);
        if (item.tags && Array.isArray(item.tags)) {
          for (const tag of item.tags) {
            if (tag) insertTag.run(result.lastInsertRowid, tag);
          }
        }
      }
    }
    return ids;
  });
  const ids = insertMany(items);
  res.status(201).json({ inserted: ids.length });
});

app.put('/api/favorites/:id', (req, res) => {
  const { alarm_price, notes, tags } = req.body;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM favorite_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(
    "UPDATE favorite_items SET alarm_price = ?, notes = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(alarm_price ?? null, notes ?? null, req.params.id);

  if (tags !== undefined && Array.isArray(tags)) {
    db.prepare('DELETE FROM favorite_tags WHERE favorite_id = ?').run(req.params.id);
    const insertTag = db.prepare('INSERT INTO favorite_tags (favorite_id, tag) VALUES (?, ?)');
    for (const tag of tags) {
      if (tag) insertTag.run(req.params.id, tag);
    }
  }

  const item = db.prepare('SELECT * FROM favorite_items WHERE id = ?').get(req.params.id) as FavoriteItem;
  const itemTags = (db.prepare('SELECT tag FROM favorite_tags WHERE favorite_id = ?').all(req.params.id) as { tag: string }[]).map((t) => t.tag);
  res.json({ ...item, tags: itemTags });
});

app.delete('/api/favorites/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM favorite_items WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ===== Transactions Routes =====

app.get('/api/transactions', (_req, res) => {
  const db = getDb();
  const items = db.prepare('SELECT * FROM transactions ORDER BY date DESC').all();
  res.json(items);
});

app.post('/api/transactions', (req, res) => {
  const { date, sold_ticker, sold_name, sold_buy_price, bought_ticker, bought_name, bought_buy_price, why_sold, why_bought, post_mortem, notes } = req.body;
  if (!date || !sold_ticker || !sold_name || sold_buy_price === undefined || !bought_ticker || !bought_name || bought_buy_price === undefined) {
    return res.status(400).json({ error: 'Required fields: date, sold_ticker, sold_name, sold_buy_price, bought_ticker, bought_name, bought_buy_price' });
  }
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO transactions (date, sold_ticker, sold_name, sold_buy_price, bought_ticker, bought_name, bought_buy_price, why_sold, why_bought, post_mortem, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(date, sold_ticker.toUpperCase(), sold_name, sold_buy_price, bought_ticker.toUpperCase(), bought_name, bought_buy_price, why_sold || null, why_bought || null, post_mortem || null, notes || null);
  const item = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

app.put('/api/transactions/:id', (req, res) => {
  const { date, sold_ticker, sold_name, sold_buy_price, bought_ticker, bought_name, bought_buy_price, why_sold, why_bought, post_mortem, notes } = req.body;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(
    "UPDATE transactions SET date=?, sold_ticker=?, sold_name=?, sold_buy_price=?, bought_ticker=?, bought_name=?, bought_buy_price=?, why_sold=?, why_bought=?, post_mortem=?, notes=?, updated_at=datetime('now') WHERE id=?"
  ).run(date, sold_ticker?.toUpperCase(), sold_name, sold_buy_price, bought_ticker?.toUpperCase(), bought_name, bought_buy_price, why_sold || null, why_bought || null, post_mortem || null, notes || null, req.params.id);

  const item = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  res.json(item);
});

app.delete('/api/transactions/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ===== Market Data Routes =====

app.get('/api/market/quote/:ticker', async (req, res) => {
  try {
    const quote = await marketDataProvider.getQuote(req.params.ticker.toUpperCase());
    res.json(quote);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/market/quotes', async (req, res) => {
  const { tickers } = req.body;
  if (!Array.isArray(tickers)) {
    return res.status(400).json({ error: 'Tickers array is required' });
  }
  try {
    const quotes = await marketDataProvider.getQuotes(tickers.map((t: string) => t.toUpperCase()));
    res.json(Object.fromEntries(quotes));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/market/historical/:ticker', async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== 'string') {
    return res.status(400).json({ error: 'Date query parameter is required' });
  }
  try {
    const price = await marketDataProvider.getHistoricalPrice(req.params.ticker.toUpperCase(), date);
    res.json({ price });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/market/search/:query', async (req, res) => {
  try {
    const results = await marketDataProvider.search(req.params.query);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Import Routes =====

app.post('/api/import/extract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let text = '';
    const mime = req.file.mimetype;

    if (mime === 'application/pdf') {
      text = await extractTextFromPdf(req.file.buffer);
    } else if (mime.startsWith('image/')) {
      // For images, return the raw text extraction hint
      // In MVP, we'll do basic text from filename and suggest manual input
      // Full OCR would require Tesseract.js which is heavy
      text = req.file.originalname.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
      return res.json({
        items: [],
        rawText: text,
        message: 'Image OCR is limited in MVP. Please add stocks manually or use PDF upload.',
      });
    } else if (mime === 'text/plain') {
      text = req.file.buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Use PDF, image, or text file.' });
    }

    const items = await extractCompaniesFromText(text);
    res.json({ items, rawText: text.substring(0, 2000) });
  } catch (error: any) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Failed to process file: ' + error.message });
  }
});

// ===== User Preferences Routes =====

app.get('/api/preferences', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM user_preferences').all() as { key: string; value: string }[];
  const prefs: Record<string, any> = {};
  for (const row of rows) {
    try {
      prefs[row.key] = JSON.parse(row.value);
    } catch {
      prefs[row.key] = row.value;
    }
  }
  res.json(prefs);
});

app.put('/api/preferences', (req, res) => {
  const db = getDb();
  const upsert = db.prepare(
    'INSERT INTO user_preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  );
  const updateMany = db.transaction((prefs: Record<string, any>) => {
    for (const [key, value] of Object.entries(prefs)) {
      const val = typeof value === 'string' ? value : JSON.stringify(value);
      upsert.run(key, val, val);
    }
  });
  updateMany(req.body);
  res.json({ success: true });
});

// ===== SPA Fallback =====
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Stock Tracker API running on http://0.0.0.0:${PORT}`);
});
