import { initDb } from './database.js';

const db = initDb();

// Clear existing data
db.exec('DELETE FROM favorite_tags');
db.exec('DELETE FROM favorite_items');
db.exec('DELETE FROM portfolio_items');
db.exec('DELETE FROM transactions');
db.exec('DELETE FROM user_preferences');

// Seed portfolio items
const insertPortfolio = db.prepare(
  'INSERT INTO portfolio_items (ticker, name, exchange, currency) VALUES (?, ?, ?, ?)'
);

const portfolioItems = [
  ['MSFT', 'Microsoft Corporation', 'NASDAQ', 'USD'],
  ['ASML.AS', 'ASML Holding NV', 'AMS', 'EUR'],
  ['AAPL', 'Apple Inc.', 'NASDAQ', 'USD'],
  ['GOOGL', 'Alphabet Inc.', 'NASDAQ', 'USD'],
  ['NOVO-B.CO', 'Novo Nordisk A/S', 'CPH', 'DKK'],
  ['MC.PA', 'LVMH Moet Hennessy', 'EPA', 'EUR'],
];

for (const [ticker, name, exchange, currency] of portfolioItems) {
  insertPortfolio.run(ticker, name, exchange, currency);
}

// Seed favorite items
const insertFavorite = db.prepare(
  'INSERT INTO favorite_items (ticker, name, exchange, currency, alarm_price, notes) VALUES (?, ?, ?, ?, ?, ?)'
);
const insertTag = db.prepare(
  'INSERT INTO favorite_tags (favorite_id, tag) VALUES (?, ?)'
);

const favoriteItems: [string, string, string, string, number | null, string | null, string[]][] = [
  ['ADYEN.AS', 'Adyen NV', 'AMS', 'EUR', 1100, 'Great payment processor, wait for dip', ['quality compounder']],
  ['V', 'Visa Inc.', 'NYSE', 'USD', 260, 'Dominant payment network', ['quality compounder']],
  ['COST', 'Costco Wholesale', 'NASDAQ', 'USD', 750, 'Best retailer, expensive', ['quality compounder']],
  ['BKNG', 'Booking Holdings', 'NASDAQ', 'USD', null, 'Online travel leader', ['cyclical']],
  ['TSM', 'Taiwan Semiconductor', 'NYSE', 'USD', 140, 'Semiconductor monopoly', ['quality compounder']],
  ['BABA', 'Alibaba Group', 'NYSE', 'USD', 80, 'Deep value play, China risk', ['deep value']],
];

for (const [ticker, name, exchange, currency, alarmPrice, notes, tags] of favoriteItems) {
  const result = insertFavorite.run(ticker, name, exchange, currency, alarmPrice, notes);
  const favId = result.lastInsertRowid;
  for (const tag of tags) {
    insertTag.run(favId, tag);
  }
}

// Seed transactions
const insertTransaction = db.prepare(
  'INSERT INTO transactions (date, sold_ticker, sold_name, sold_buy_price, bought_ticker, bought_name, bought_buy_price, why_sold, why_bought, post_mortem, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

const transactions = [
  ['2024-03-15', 'META', 'Meta Platforms', 200, 'MSFT', 'Microsoft Corporation', 380,
    'Valuation stretched after 3x rally', 'AI leader with cloud moat', null, 'Switched from social to enterprise AI'],
  ['2024-06-01', 'INTC', 'Intel Corporation', 35, 'TSM', 'Taiwan Semiconductor', 130,
    'Execution issues, losing market share', 'Dominant foundry, Apple/Nvidia supplier', null, 'Bet on foundry leader vs. laggard'],
  ['2024-09-10', 'PYPL', 'PayPal Holdings', 70, 'ADYEN.AS', 'Adyen NV', 1200,
    'Margin compression, competition', 'Superior technology, institutional focus', null, 'Quality over quantity in payments'],
];

for (const [date, soldTicker, soldName, soldBuyPrice, boughtTicker, boughtName, boughtBuyPrice, whySold, whyBought, postMortem, notes] of transactions) {
  insertTransaction.run(date, soldTicker, soldName, soldBuyPrice, boughtTicker, boughtName, boughtBuyPrice, whySold, whyBought, postMortem, notes);
}

// Seed default preferences
const upsertPref = db.prepare(
  'INSERT INTO user_preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
);

const defaultPrefs = {
  darkMode: false,
  benchmarkTicker: 'SPY',
  portfolioColumns: JSON.stringify(['currentPrice', 'dayChangePercent', 'performance1Y', 'peRatio', 'evToEbitda', 'targetMeanPrice', 'marketCap']),
  favoritesColumns: JSON.stringify(['currentPrice', 'dayChangePercent', 'alarmDiffPercent', 'performance1Y', 'peRatio', 'evToEbitda', 'targetMeanPrice']),
};

for (const [key, value] of Object.entries(defaultPrefs)) {
  const val = typeof value === 'string' ? value : JSON.stringify(value);
  upsertPref.run(key, val, val);
}

console.log('Seed data inserted successfully!');
console.log(`  Portfolio: ${portfolioItems.length} items`);
console.log(`  Favorites: ${favoriteItems.length} items`);
console.log(`  Transactions: ${transactions.length} items`);
process.exit(0);
