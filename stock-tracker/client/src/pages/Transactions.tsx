import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, RefreshCw, Download, ArrowUpDown, Loader2, Clock, Edit2, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { Transaction, MarketQuote } from '../types';
import { getTransactions, addTransaction, updateTransaction, deleteTransaction, getQuotes, getHistoricalPrice } from '../api';
import { formatPercent, formatPrice, calcTransactionReturn, calcHoldingPeriod, calcMean, calcMedian, exportToCsv } from '../utils';
import ConfirmDialog from '../components/ConfirmDialog';

interface TransactionWithMarket extends Transaction {
  soldCurrentPrice: number | null;
  boughtCurrentPrice: number | null;
  transactionReturn: number | null;
  holdingPeriod: string;
  benchmarkReturn: number | null;
}

export default function Transactions() {
  const [items, setItems] = useState<TransactionWithMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<string>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [benchmarkTicker] = useState('SPY');

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    sold_ticker: '', sold_name: '', sold_buy_price: '',
    bought_ticker: '', bought_name: '', bought_buy_price: '',
    why_sold: '', why_bought: '', post_mortem: '', notes: '',
  });

  const enrichWithMarket = useCallback(async (txs: Transaction[]): Promise<TransactionWithMarket[]> => {
    if (txs.length === 0) return [];

    const allTickers = new Set<string>();
    txs.forEach((tx) => { allTickers.add(tx.sold_ticker); allTickers.add(tx.bought_ticker); });
    allTickers.add(benchmarkTicker);

    const quotes = await getQuotes(Array.from(allTickers));

    // Fetch benchmark historical prices for each transaction date
    const benchmarkPrices = new Map<string, number | null>();
    const benchmarkCurrent = quotes[benchmarkTicker]?.currentPrice ?? null;

    for (const tx of txs) {
      if (!benchmarkPrices.has(tx.date)) {
        try {
          const hist = await getHistoricalPrice(benchmarkTicker, tx.date);
          benchmarkPrices.set(tx.date, hist.price);
        } catch {
          benchmarkPrices.set(tx.date, null);
        }
      }
    }

    return txs.map((tx) => {
      const soldCurrent = quotes[tx.sold_ticker]?.currentPrice ?? null;
      const boughtCurrent = quotes[tx.bought_ticker]?.currentPrice ?? null;
      const txReturn = calcTransactionReturn(boughtCurrent, tx.bought_buy_price, soldCurrent, tx.sold_buy_price);
      const holdingPeriod = calcHoldingPeriod(tx.date);

      let benchmarkReturn: number | null = null;
      const benchDate = benchmarkPrices.get(tx.date);
      if (benchDate && benchDate > 0 && benchmarkCurrent) {
        benchmarkReturn = ((benchmarkCurrent - benchDate) / benchDate) * 100;
      }

      return {
        ...tx,
        soldCurrentPrice: soldCurrent,
        boughtCurrentPrice: boughtCurrent,
        transactionReturn: txReturn,
        holdingPeriod,
        benchmarkReturn,
      };
    });
  }, [benchmarkTicker]);

  const loadData = useCallback(async () => {
    try {
      const data = await getTransactions();
      const enriched = await enrichWithMarket(data);
      setItems(enriched);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to load transactions:', err);
    }
    setLoading(false);
  }, [enrichWithMarket]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await getTransactions();
      const enriched = await enrichWithMarket(data);
      setItems(enriched);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {}
    setRefreshing(false);
  };

  const resetForm = () => {
    setForm({
      date: new Date().toISOString().split('T')[0],
      sold_ticker: '', sold_name: '', sold_buy_price: '',
      bought_ticker: '', bought_name: '', bought_buy_price: '',
      why_sold: '', why_bought: '', post_mortem: '', notes: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      date: form.date,
      sold_ticker: form.sold_ticker.toUpperCase(),
      sold_name: form.sold_name,
      sold_buy_price: Number(form.sold_buy_price),
      bought_ticker: form.bought_ticker.toUpperCase(),
      bought_name: form.bought_name,
      bought_buy_price: Number(form.bought_buy_price),
      why_sold: form.why_sold || null,
      why_bought: form.why_bought || null,
      post_mortem: form.post_mortem || null,
      notes: form.notes || null,
    };

    try {
      if (editingId) {
        await updateTransaction(editingId, payload);
      } else {
        await addTransaction(payload as any);
      }
      await loadData();
      setShowForm(false);
      setEditingId(null);
      resetForm();
    } catch (err: any) {
      alert('Failed: ' + err.message);
    }
  };

  const startEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setForm({
      date: tx.date,
      sold_ticker: tx.sold_ticker,
      sold_name: tx.sold_name,
      sold_buy_price: String(tx.sold_buy_price),
      bought_ticker: tx.bought_ticker,
      bought_name: tx.bought_name,
      bought_buy_price: String(tx.bought_buy_price),
      why_sold: tx.why_sold || '',
      why_bought: tx.why_bought || '',
      post_mortem: tx.post_mortem || '',
      notes: tx.notes || '',
    });
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTransaction(deleteTarget.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
    setDeleteTarget(null);
  };

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  // Filter & sort
  const filteredItems = items.filter((tx) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return tx.sold_name.toLowerCase().includes(q) || tx.bought_name.toLowerCase().includes(q) ||
           tx.sold_ticker.toLowerCase().includes(q) || tx.bought_ticker.toLowerCase().includes(q);
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'date') return dir * a.date.localeCompare(b.date);
    if (sortKey === 'transactionReturn') {
      if (a.transactionReturn === null && b.transactionReturn === null) return 0;
      if (a.transactionReturn === null) return 1;
      if (b.transactionReturn === null) return -1;
      return dir * (a.transactionReturn - b.transactionReturn);
    }
    if (sortKey === 'benchmarkReturn') {
      if (a.benchmarkReturn === null && b.benchmarkReturn === null) return 0;
      if (a.benchmarkReturn === null) return 1;
      if (b.benchmarkReturn === null) return -1;
      return dir * (a.benchmarkReturn - b.benchmarkReturn);
    }
    return 0;
  });

  // Summary calculations
  const validReturns = items.map((i) => i.transactionReturn).filter((r): r is number => r !== null);
  const excludedCount = items.length - validReturns.length;
  const avgReturn = calcMean(validReturns);
  const medReturn = calcMedian(validReturns);

  const handleExport = () => {
    const headers = ['Date', 'Sold', 'Sold Ticker', 'Sold Buy Price', 'Sold Current', 'Bought', 'Bought Ticker', 'Bought Buy Price', 'Bought Current', 'Return %', 'Holding Period', 'Benchmark %', 'Why Sold', 'Why Bought', 'Post Mortem', 'Notes'];
    const rows = sortedItems.map((tx) => [
      tx.date, tx.sold_name, tx.sold_ticker, String(tx.sold_buy_price),
      tx.soldCurrentPrice !== null && tx.soldCurrentPrice !== undefined ? String(tx.soldCurrentPrice) : 'n/a',
      tx.bought_name, tx.bought_ticker, String(tx.bought_buy_price),
      tx.boughtCurrentPrice !== null && tx.boughtCurrentPrice !== undefined ? String(tx.boughtCurrentPrice) : 'n/a',
      tx.transactionReturn !== null ? tx.transactionReturn.toFixed(2) : 'n/a',
      tx.holdingPeriod || 'n/a',
      tx.benchmarkReturn !== null ? tx.benchmarkReturn.toFixed(2) : 'n/a',
      tx.why_sold || '', tx.why_bought || '', tx.post_mortem || '', tx.notes || '',
    ]);
    exportToCsv(headers, rows, 'transactions.csv');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">Transacties</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{items.length} transactions</p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {lastUpdated}</span>
          )}
          <button onClick={handleRefresh} disabled={refreshing} className="btn-secondary flex items-center gap-1.5">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5"><Download className="w-4 h-4" /> CSV</button>
          <button onClick={() => { setShowForm(true); setEditingId(null); resetForm(); }} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Transaction
          </button>
        </div>
      </div>

      {/* Transaction Form */}
      {showForm && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{editingId ? 'Edit Transaction' : 'New Transaction'}</h3>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-icon"><X className="w-4 h-4" /></button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Date</label>
                <input type="date" className="input-field" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} required />
              </div>
              <div className="col-span-1 md:col-span-2 lg:col-span-3 border-b border-gray-200 dark:border-gray-700 pb-1 mb-1">
                <span className="text-xs font-semibold text-red-600 dark:text-red-400">SOLD</span>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Sold Ticker</label>
                <input type="text" className="input-field" placeholder="e.g. META" value={form.sold_ticker} onChange={(e) => setForm((p) => ({ ...p, sold_ticker: e.target.value.toUpperCase() }))} required />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Sold Company</label>
                <input type="text" className="input-field" placeholder="e.g. Meta Platforms" value={form.sold_name} onChange={(e) => setForm((p) => ({ ...p, sold_name: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Original Buy Price</label>
                <input type="number" step="0.01" className="input-field" placeholder="0.00" value={form.sold_buy_price} onChange={(e) => setForm((p) => ({ ...p, sold_buy_price: e.target.value }))} required />
              </div>
              <div className="col-span-1 md:col-span-2 lg:col-span-4 border-b border-gray-200 dark:border-gray-700 pb-1 mb-1">
                <span className="text-xs font-semibold text-green-600 dark:text-green-400">BOUGHT</span>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Bought Ticker</label>
                <input type="text" className="input-field" placeholder="e.g. MSFT" value={form.bought_ticker} onChange={(e) => setForm((p) => ({ ...p, bought_ticker: e.target.value.toUpperCase() }))} required />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Bought Company</label>
                <input type="text" className="input-field" placeholder="e.g. Microsoft" value={form.bought_name} onChange={(e) => setForm((p) => ({ ...p, bought_name: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Buy Price</label>
                <input type="number" step="0.01" className="input-field" placeholder="0.00" value={form.bought_buy_price} onChange={(e) => setForm((p) => ({ ...p, bought_buy_price: e.target.value }))} required />
              </div>
              <div className="col-span-1 md:col-span-2 lg:col-span-4 border-b border-gray-200 dark:border-gray-700 pb-1 mb-1">
                <span className="text-xs font-semibold text-gray-500">NOTES</span>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Why Sold</label>
                <textarea className="input-field h-16 resize-none" value={form.why_sold} onChange={(e) => setForm((p) => ({ ...p, why_sold: e.target.value }))} placeholder="Reason for selling..." />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Why Bought</label>
                <textarea className="input-field h-16 resize-none" value={form.why_bought} onChange={(e) => setForm((p) => ({ ...p, why_bought: e.target.value }))} placeholder="Reason for buying..." />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Post-Mortem</label>
                <textarea className="input-field h-16 resize-none" value={form.post_mortem} onChange={(e) => setForm((p) => ({ ...p, post_mortem: e.target.value }))} placeholder="Retrospective analysis..." />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">General Notes</label>
                <textarea className="input-field h-16 resize-none" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Any additional notes..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">{editingId ? 'Update' : 'Add'} Transaction</button>
            </div>
          </form>
        </div>
      )}

      {/* Filter */}
      <div className="mb-3">
        <input
          type="text"
          className="input-field max-w-sm"
          placeholder="Filter by name or ticker..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {/* Table */}
      {sortedItems.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            {items.length === 0 ? 'No transactions yet.' : 'No results match your filter.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="table-header w-8"></th>
                <th className="table-header" onClick={() => handleSort('date')}>
                  <span className="flex items-center gap-1">Date {sortKey === 'date' && <ArrowUpDown className="w-3 h-3" />}</span>
                </th>
                <th className="table-header">Sold</th>
                <th className="table-header text-right">Buy Price</th>
                <th className="table-header text-right">Current</th>
                <th className="table-header">Bought</th>
                <th className="table-header text-right">Buy Price</th>
                <th className="table-header text-right">Current</th>
                <th className="table-header text-right" onClick={() => handleSort('transactionReturn')}>
                  <span className="flex items-center justify-end gap-1">Return {sortKey === 'transactionReturn' && <ArrowUpDown className="w-3 h-3" />}</span>
                </th>
                <th className="table-header">Period</th>
                <th className="table-header text-right" onClick={() => handleSort('benchmarkReturn')}>
                  <span className="flex items-center justify-end gap-1">Bench {sortKey === 'benchmarkReturn' && <ArrowUpDown className="w-3 h-3" />}</span>
                </th>
                <th className="table-header w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {sortedItems.map((tx) => {
                const isExpanded = expandedId === tx.id;
                return (
                  <React.Fragment key={tx.id}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="table-cell">
                        <button onClick={() => setExpandedId(isExpanded ? null : tx.id)} className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                      <td className="table-cell text-xs">{tx.date}</td>
                      <td className="table-cell">
                        <div className="text-xs font-medium text-red-600 dark:text-red-400">{tx.sold_ticker}</div>
                        <div className="text-xs text-gray-400 truncate max-w-[120px]">{tx.sold_name}</div>
                      </td>
                      <td className="table-cell text-right font-mono text-xs">{formatPrice(tx.sold_buy_price)}</td>
                      <td className="table-cell text-right font-mono text-xs">{tx.soldCurrentPrice !== null && tx.soldCurrentPrice !== undefined ? formatPrice(tx.soldCurrentPrice) : 'n/a'}</td>
                      <td className="table-cell">
                        <div className="text-xs font-medium text-green-600 dark:text-green-400">{tx.bought_ticker}</div>
                        <div className="text-xs text-gray-400 truncate max-w-[120px]">{tx.bought_name}</div>
                      </td>
                      <td className="table-cell text-right font-mono text-xs">{formatPrice(tx.bought_buy_price)}</td>
                      <td className="table-cell text-right font-mono text-xs">{tx.boughtCurrentPrice !== null && tx.boughtCurrentPrice !== undefined ? formatPrice(tx.boughtCurrentPrice) : 'n/a'}</td>
                      <td className={`table-cell text-right font-mono text-xs font-semibold ${
                        tx.transactionReturn !== null
                          ? tx.transactionReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          : ''
                      }`}>
                        {tx.transactionReturn !== null ? formatPercent(tx.transactionReturn) : 'n/a'}
                      </td>
                      <td className="table-cell text-xs text-gray-500">{tx.holdingPeriod || 'n/a'}</td>
                      <td className={`table-cell text-right font-mono text-xs ${
                        tx.benchmarkReturn !== null
                          ? tx.benchmarkReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          : ''
                      }`}>
                        {tx.benchmarkReturn !== null ? formatPercent(tx.benchmarkReturn) : 'n/a'}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => startEdit(tx)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-600">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteTarget(tx)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Expanded row for notes */}
                    {isExpanded && (
                      <tr className="bg-gray-50 dark:bg-gray-800/30">
                        <td colSpan={12} className="px-4 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            {tx.why_sold && (
                              <div><span className="font-semibold text-gray-500 dark:text-gray-400 block mb-0.5">Why Sold</span><p>{tx.why_sold}</p></div>
                            )}
                            {tx.why_bought && (
                              <div><span className="font-semibold text-gray-500 dark:text-gray-400 block mb-0.5">Why Bought</span><p>{tx.why_bought}</p></div>
                            )}
                            {tx.post_mortem && (
                              <div><span className="font-semibold text-gray-500 dark:text-gray-400 block mb-0.5">Post-Mortem</span><p>{tx.post_mortem}</p></div>
                            )}
                            {tx.notes && (
                              <div><span className="font-semibold text-gray-500 dark:text-gray-400 block mb-0.5">Notes</span><p>{tx.notes}</p></div>
                            )}
                            {!tx.why_sold && !tx.why_bought && !tx.post_mortem && !tx.notes && (
                              <p className="text-gray-400 italic">No notes for this transaction.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      {items.length > 0 && (
        <div className="card p-4 mt-4">
          <h3 className="text-sm font-semibold mb-3">Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Avg Return</div>
              <div className={`text-lg font-bold ${avgReturn !== null && avgReturn >= 0 ? 'text-green-600 dark:text-green-400' : avgReturn !== null ? 'text-red-600 dark:text-red-400' : ''}`}>
                {avgReturn !== null ? formatPercent(avgReturn) : 'n/a'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Median Return</div>
              <div className={`text-lg font-bold ${medReturn !== null && medReturn >= 0 ? 'text-green-600 dark:text-green-400' : medReturn !== null ? 'text-red-600 dark:text-red-400' : ''}`}>
                {medReturn !== null ? formatPercent(medReturn) : 'n/a'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Valid Transactions</div>
              <div className="text-lg font-bold">{validReturns.length}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Excluded (n/a)</div>
              <div className="text-lg font-bold text-gray-400">{excludedCount}</div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Transaction"
        message={`Delete the transaction from ${deleteTarget?.date}? (${deleteTarget?.sold_ticker} → ${deleteTarget?.bought_ticker})`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
