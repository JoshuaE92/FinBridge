import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const API_BASE_URL =
    (import.meta.env.VITE_BACKEND_URL &&
        import.meta.env.VITE_BACKEND_URL.replace(/\/$/, '')) ||
    'http://localhost:5001/api';

const CULTURE_OPTIONS = [
    'American', 'Spanish', 'Uzbek', 'Indian',
    'Haitian', 'Chinese', 'Nigerian', 'Japanese',
];

const PRIORITY_STYLES = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-gray-100 text-gray-600',
};

export default function CreditRoadmap() {
    const [linked, setLinked] = useState(null); // null = unknown
    const [language, setLanguage] = useState('en');
    const [culture, setCulture] = useState('American');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/plaid/status`);
                const s = await res.json();
                setLinked(Boolean(s.linked));
            } catch {
                setLinked(false);
            }
        })();
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(
                `${API_BASE_URL}/plaid/credit-roadmap?language=${language}&culture=${culture}`
            );
            const body = await res.json();
            if (!res.ok) throw new Error(body?.detail || body?.error || 'Could not build roadmap');
            setData(body);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [language, culture]);

    if (linked === false) {
        return (
            <main className="mx-auto max-w-xl px-6 py-20 text-center font-serif">
                <h1 className="text-2xl font-semibold text-neutral-900">Credit roadmap</h1>
                <p className="mt-2 text-neutral-600">
                    Connect a bank first so we can build a plan from your real accounts.
                </p>
                <Link
                    to="/dashboard"
                    className="mt-6 inline-block rounded-md bg-green-600 px-6 py-2.5 font-medium text-white hover:bg-green-700"
                >
                    Go to Dashboard
                </Link>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-3xl px-6 py-10 font-serif">
            <h1 className="text-3xl font-extrabold text-neutral-900">Your credit roadmap</h1>
            <p className="mt-2 text-neutral-600">
                Building US credit from zero. This reads your linked accounts and maps the
                best next moves.{' '}
                <span className="text-neutral-400">
                    (Not a credit score — those come from a bureau; this is a plan based on
                    your account signals.)
                </span>
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
                <select
                    className="rounded border px-3 py-2 text-sm"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                </select>
                <select
                    className="rounded border px-3 py-2 text-sm"
                    value={culture}
                    onChange={(e) => setCulture(e.target.value)}
                >
                    {CULTURE_OPTIONS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="rounded-md bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                >
                    {loading ? 'Building…' : data ? 'Rebuild' : 'Build my roadmap'}
                </button>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            {data && (
                <div className="mt-8 space-y-6">
                    {/* Signals */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <Signal
                            label="Credit card"
                            value={data.signals.hasCreditCard ? 'Yes' : 'None yet'}
                        />
                        <Signal
                            label="Utilization"
                            value={
                                data.signals.creditUtilizationPct == null
                                    ? '—'
                                    : `${data.signals.creditUtilizationPct}%`
                            }
                        />
                        <Signal
                            label="Cash buffer"
                            value={
                                data.signals.monthsOfBuffer == null
                                    ? '—'
                                    : `${data.signals.monthsOfBuffer} mo`
                            }
                        />
                    </div>

                    {/* Standing */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                            Where you stand
                        </h2>
                        <p className="mt-2 text-neutral-800">{data.roadmap.standing}</p>
                    </div>

                    {/* Moves */}
                    <div>
                        <h2 className="mb-3 text-lg font-semibold text-neutral-900">
                            Best next moves
                        </h2>
                        <ol className="space-y-3">
                            {data.roadmap.moves.map((m, i) => (
                                <li
                                    key={i}
                                    className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                                >
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-neutral-900">
                                            {i + 1}. {m.title}
                                        </h3>
                                        {m.priority && (
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    PRIORITY_STYLES[m.priority.toLowerCase()] ||
                                                    'bg-gray-100 text-gray-600'
                                                }`}
                                            >
                                                {m.priority}
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-1 text-sm text-neutral-600">{m.why}</p>
                                </li>
                            ))}
                        </ol>
                    </div>

                    {/* Explanation */}
                    <div className="rounded-xl border border-gray-200 bg-neutral-50 p-6">
                        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                            What is a credit score, anyway?
                        </h3>
                        <p className="text-sm text-neutral-700">{data.roadmap.explanation}</p>
                    </div>
                </div>
            )}
        </main>
    );
}

function Signal({ label, value }) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-neutral-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-neutral-900">{value}</p>
        </div>
    );
}
