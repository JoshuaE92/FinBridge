import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

const API_BASE_URL =
    (import.meta.env.VITE_BACKEND_URL &&
        import.meta.env.VITE_BACKEND_URL.replace(/\/$/, '')) ||
    'http://localhost:5001/api';

const money = (n, currency = 'USD') =>
    n == null
        ? '—'
        : new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency,
          }).format(n);

const ACCOUNT_GROUPS = [
    { key: 'depository', label: 'Cash' },
    { key: 'investment', label: 'Investments' },
    { key: 'credit', label: 'Credit' },
    { key: 'loan', label: 'Loans' },
];

function StatCard({ label, value, valueClass = 'text-neutral-900', sub }) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">{label}</p>
            <p className={`mt-1 text-2xl font-semibold ${valueClass}`}>{value}</p>
            {sub && <p className="mt-1 text-sm text-neutral-500">{sub}</p>}
        </div>
    );
}

export default function AccountDashboard() {
    const [linkToken, setLinkToken] = useState(null);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const loadOverview = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE_URL}/plaid/overview`);
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error || 'Could not load your data');
            setData(body);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // On mount: fetch a Link token, and if a bank is already linked, load data.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [tokenRes, statusRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/plaid/create_link_token`, { method: 'POST' }),
                    fetch(`${API_BASE_URL}/plaid/status`),
                ]);
                const tokenBody = await tokenRes.json();
                if (!tokenRes.ok) throw new Error(tokenBody?.error || 'Could not start Plaid');
                if (!cancelled) setLinkToken(tokenBody.link_token);

                const status = await statusRes.json().catch(() => ({}));
                if (!cancelled && status.linked) loadOverview();
            } catch (err) {
                if (!cancelled) setError(err.message);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [loadOverview]);

    const onSuccess = useCallback(
        async (publicToken) => {
            setLoading(true);
            setError('');
            try {
                const res = await fetch(`${API_BASE_URL}/plaid/exchange_public_token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ public_token: publicToken }),
                });
                const body = await res.json();
                if (!res.ok) throw new Error(body?.error || 'Could not link account');
                await loadOverview();
            } catch (err) {
                setError(err.message);
                setLoading(false);
            }
        },
        [loadOverview]
    );

    const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

    // ---- Empty / connect state -------------------------------------------
    if (!data) {
        return (
            <div className="mx-auto max-w-md px-6 py-20 text-center">
                <h1 className="text-2xl font-semibold text-neutral-900">
                    Connect your bank
                </h1>
                <p className="mt-2 text-neutral-600">
                    Link an account to see your balances, spending, and cash flow.
                </p>
                <button
                    type="button"
                    onClick={() => open()}
                    disabled={!ready || !linkToken || loading}
                    className="mt-6 rounded-md bg-green-600 px-6 py-2.5 font-medium text-white hover:bg-green-700 disabled:opacity-60"
                >
                    {loading ? 'Loading…' : 'Connect your bank'}
                </button>
                <p className="mt-4 text-xs text-neutral-500">
                    Sandbox login: <code className="rounded bg-neutral-100 px-1">user_good</code>{' '}
                    / <code className="rounded bg-neutral-100 px-1">pass_good</code>
                </p>
                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            </div>
        );
    }

    // ---- Dashboard --------------------------------------------------------
    const { currency, summary, cashFlow, spendingByCategory, accounts, transactions } = data;
    const maxCat = spendingByCategory[0]?.amount || 1;

    return (
        <div className="mx-auto max-w-5xl px-6 py-8">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-neutral-900">Your dashboard</h1>
                <button
                    onClick={loadOverview}
                    className="text-sm text-green-700 hover:underline"
                    disabled={loading}
                >
                    {loading ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            {/* Summary */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                    label="Net worth"
                    value={money(summary.netWorth, currency)}
                    valueClass={summary.netWorth < 0 ? 'text-red-600' : 'text-neutral-900'}
                    sub={`${money(summary.assets, currency)} assets`}
                />
                <StatCard
                    label={`Income · ${cashFlow.period}`}
                    value={money(cashFlow.income, currency)}
                    valueClass="text-green-600"
                />
                <StatCard
                    label={`Spending · ${cashFlow.period}`}
                    value={money(cashFlow.spending, currency)}
                    valueClass="text-neutral-900"
                    sub={`Net ${money(cashFlow.net, currency)}`}
                />
            </div>

            {/* Spending by category */}
            <section className="mt-8">
                <h2 className="mb-3 text-lg font-semibold text-neutral-900">
                    Spending by category
                </h2>
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    {spendingByCategory.length === 0 ? (
                        <p className="text-neutral-500">No spending in this period.</p>
                    ) : (
                        <div className="space-y-3">
                            {spendingByCategory.map((c) => (
                                <div key={c.category}>
                                    <div className="mb-1 flex justify-between text-sm">
                                        <span className="text-neutral-700">{c.category}</span>
                                        <span className="font-medium text-neutral-900">
                                            {money(c.amount, currency)}
                                        </span>
                                    </div>
                                    <div className="h-2 w-full rounded-full bg-gray-100">
                                        <div
                                            className="h-2 rounded-full bg-green-500"
                                            style={{ width: `${(c.amount / maxCat) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Accounts */}
            <section className="mt-8">
                <h2 className="mb-3 text-lg font-semibold text-neutral-900">Accounts</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {ACCOUNT_GROUPS.map((group) => {
                        const groupAccounts = accounts.filter((a) => a.type === group.key);
                        if (!groupAccounts.length) return null;
                        return (
                            <div
                                key={group.key}
                                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                            >
                                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                                    {group.label}
                                </h3>
                                <ul className="space-y-2">
                                    {groupAccounts.map((a) => (
                                        <li key={a.id} className="flex justify-between text-sm">
                                            <span className="text-neutral-700">
                                                {a.name}
                                                <span className="text-neutral-400"> ••{a.mask}</span>
                                            </span>
                                            <span className="font-medium text-neutral-900">
                                                {money(a.current, a.currency)}
                                                {a.limit != null && (
                                                    <span className="text-neutral-400">
                                                        {' '}
                                                        / {money(a.limit, a.currency)}
                                                    </span>
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Recent transactions */}
            <section className="mt-8">
                <h2 className="mb-3 text-lg font-semibold text-neutral-900">
                    Recent transactions
                </h2>
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <ul className="divide-y divide-gray-100">
                        {transactions.map((t, i) => (
                            <li key={i} className="flex items-center gap-3 px-4 py-3">
                                {t.logoUrl ? (
                                    <img
                                        src={t.logoUrl}
                                        alt=""
                                        className="h-8 w-8 rounded-full object-contain"
                                    />
                                ) : (
                                    <div className="h-8 w-8 rounded-full bg-gray-100" />
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-neutral-900">
                                        {t.name}
                                    </p>
                                    <p className="text-xs text-neutral-500">
                                        {t.date} · {t.category}
                                        {t.pending && ' · pending'}
                                    </p>
                                </div>
                                <span
                                    className={`text-sm font-medium ${
                                        t.amount < 0 ? 'text-green-600' : 'text-neutral-900'
                                    }`}
                                >
                                    {t.amount < 0 ? '+' : '-'}
                                    {money(Math.abs(t.amount), t.currency)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>
        </div>
    );
}
