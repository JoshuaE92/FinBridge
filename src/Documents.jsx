import { useEffect, useState } from 'react';
import { getUserId } from './userId.js';

const API_BASE_URL =
    (import.meta.env.VITE_BACKEND_URL &&
        import.meta.env.VITE_BACKEND_URL.replace(/\/$/, '')) ||
    'http://localhost:5001/api';

export default function Documents() {
    const [documents, setDocuments] = useState(null);
    const [error, setError] = useState('');
    const [open, setOpen] = useState(null); // docId whose file is shown

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(
                    `${API_BASE_URL}/documents?userId=${encodeURIComponent(getUserId())}`
                );
                const body = await res.json();
                if (!res.ok) throw new Error(body?.error || 'Could not load documents');
                setDocuments(body.documents);
            } catch (err) {
                setError(err.message);
            }
        })();
    }, []);

    const fileUrl = (docId) =>
        `${API_BASE_URL}/documents/${docId}/file?userId=${encodeURIComponent(getUserId())}`;

    return (
        <main className="mx-auto max-w-3xl px-6 py-10 font-serif">
            <h1 className="text-3xl font-extrabold text-neutral-900">My documents</h1>
            <p className="mt-2 text-neutral-600">
                Everything you&apos;ve uploaded to Explain. Your assistant remembers these
                when you chat.
            </p>

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            {documents && documents.length === 0 && (
                <p className="mt-8 text-neutral-500">
                    No documents yet — upload one in the Explain tab.
                </p>
            )}

            <div className="mt-6 space-y-4">
                {(documents || []).map((d) => (
                    <div
                        key={d.docId}
                        className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="font-semibold text-neutral-900">
                                    {d.analysis?.title || d.fileName}
                                </h2>
                                <p className="text-xs text-neutral-500">
                                    {(d.uploadedAt || '').slice(0, 10)} · {d.fileName}
                                </p>
                            </div>
                            <button
                                onClick={() => setOpen(open === d.docId ? null : d.docId)}
                                className="whitespace-nowrap text-sm text-green-700 hover:underline"
                            >
                                {open === d.docId ? 'Hide' : 'View file'}
                            </button>
                        </div>

                        {d.analysis?.summary && (
                            <p className="mt-2 text-sm text-neutral-700">{d.analysis.summary}</p>
                        )}

                        {open === d.docId && (
                            <img
                                src={fileUrl(d.docId)}
                                alt={d.fileName}
                                className="mt-4 max-h-96 rounded-lg border border-gray-100 object-contain"
                            />
                        )}
                    </div>
                ))}
            </div>
        </main>
    );
}
