import { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const API_BASE_URL =
    (import.meta.env.VITE_BACKEND_URL &&
        import.meta.env.VITE_BACKEND_URL.replace(/\/$/, '')) ||
    'http://localhost:5001/api';

const CULTURE_OPTIONS = [
    'American', 'Spanish', 'Uzbek', 'Indian',
    'Haitian', 'Chinese', 'Nigerian', 'Japanese',
];

const MAX_BYTES = 6 * 1024 * 1024; // 6 MB

// Turn a File (image or PDF) into { base64, mimeType } (strips the data: URL prefix).
function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result || '';
            const base64 = String(result).split(',')[1] || '';
            resolve({ base64, mimeType: file.type || 'image/jpeg' });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Rasterize a PDF's first page to a PNG so we can BOTH display it and let Gemini
// annotate the same pixels (so the overlay boxes line up).
async function renderPdfFirstPage(file) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const dataUrl = canvas.toDataURL('image/png');
    return { dataUrl, base64: dataUrl.split(',')[1] || '' };
}

export default function Explain() {
    const [language, setLanguage] = useState('en');
    const [culture, setCulture] = useState('American');
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [hovered, setHovered] = useState(null);
    // The image actually shown + annotated (the photo, or a PDF's rendered page).
    const [displaySrc, setDisplaySrc] = useState('');
    // The analyzed document, kept so the user can ask follow-up questions about it.
    const [docImage, setDocImage] = useState(null);
    const [chat, setChat] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);

    const onFile = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (f.size > MAX_BYTES) {
            setError('That file is too large (max 6 MB).');
            return;
        }
        setError('');
        setFile(f);
        // PDFs can't render in an <img>; show a file chip instead of a preview.
        setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : '');
    };

    const submit = async () => {
        if (!file) {
            setError('Upload a document photo or PDF to explain.');
            return;
        }
        setLoading(true);
        setError('');
        setResult(null);
        setDisplaySrc('');
        setDocImage(null);
        setChat([]);
        try {
            const body = { language, culture };
            let img;
            if (file.type === 'application/pdf') {
                // Rasterize page 1 and send THAT image so boxes align.
                const { dataUrl, base64 } = await renderPdfFirstPage(file);
                img = { base64, mimeType: 'image/png' };
                setDisplaySrc(dataUrl);
            } else {
                const { base64, mimeType } = await readFile(file);
                img = { base64, mimeType };
                setDisplaySrc(preview);
            }
            body.imageBase64 = img.base64;
            body.mimeType = img.mimeType;
            setDocImage(img);

            const res = await fetch(`${API_BASE_URL}/explain`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.detail || data?.error || 'Something went wrong');
            setResult(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const ask = async () => {
        const q = chatInput.trim();
        if (!q || chatLoading || !docImage) return;
        setChat((prev) => [...prev, { role: 'user', text: q }]);
        setChatInput('');
        setChatLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/explain/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64: docImage.base64,
                    mimeType: docImage.mimeType,
                    question: q,
                    language,
                    culture,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.detail || data?.error || 'Could not answer');
            setChat((prev) => [...prev, { role: 'model', text: data.answer }]);
        } catch (err) {
            setChat((prev) => [...prev, { role: 'model', text: `⚠️ ${err.message}` }]);
        } finally {
            setChatLoading(false);
        }
    };

    return (
        <main className="mx-auto max-w-3xl px-6 py-10 font-serif">
            <h1 className="text-3xl font-extrabold text-neutral-900">Explain this</h1>
            <p className="mt-2 text-neutral-600">
                Upload a photo or PDF of a document you don&apos;t understand — a bill, a
                lease, a letter, a form. We&apos;ll explain it in your language, tell you
                what to do, and you can ask follow-up questions about it.
            </p>

            {/* Controls */}
            <div className="mt-6 flex flex-wrap gap-3">
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
            </div>

            {/* Upload (primary input) */}
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-10 text-center hover:border-green-500">
                <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={onFile}
                />
                {preview ? (
                    <img src={preview} alt="preview" className="max-h-56 rounded object-contain" />
                ) : file ? (
                    <span className="text-sm font-medium text-neutral-700">📄 {file.name}</span>
                ) : (
                    <span className="text-neutral-500">
                        📷 Tap to upload or photograph a document (image or PDF)
                    </span>
                )}
            </label>

            <button
                type="button"
                onClick={submit}
                disabled={loading || !file}
                className="mt-4 rounded-md bg-green-600 px-6 py-2.5 font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
                {loading ? 'Explaining…' : 'Explain it'}
            </button>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            {/* Result */}
            {result && (
                <div className="mt-8 space-y-6">
                    {/* Annotated document overlay */}
                    {displaySrc && (
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <AnnotatedImage
                                src={displaySrc}
                                annotations={result.annotations || []}
                                hovered={hovered}
                                setHovered={setHovered}
                            />
                            {(!result.annotations || result.annotations.length === 0) && (
                                <p className="mt-3 text-xs text-neutral-400">
                                    Couldn&apos;t pinpoint specific regions on this document — see
                                    the explanation below.
                                </p>
                            )}
                            <ol className="mt-4 space-y-2">
                                {(result.annotations || []).map((a, i) => (
                                    <li
                                        key={i}
                                        onMouseEnter={() => setHovered(i)}
                                        onMouseLeave={() => setHovered(null)}
                                        className={`flex cursor-default items-start gap-2 rounded-lg px-2 py-1 text-sm ${
                                            hovered === i ? 'bg-green-50' : ''
                                        }`}
                                    >
                                        <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
                                            {i + 1}
                                        </span>
                                        <span className="text-neutral-700">{a.note}</span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}

                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                        <h2 className="text-xl font-semibold text-neutral-900">{result.title}</h2>
                        <p className="mt-2 text-neutral-700">{result.summary}</p>
                    </div>

                    {/* How it affects the user's real money (Plaid-grounded) */}
                    {result.personalConnection && (
                        <div className="rounded-xl border border-green-200 bg-green-50 p-6">
                            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-green-700">
                                💰 How this affects your money
                            </h3>
                            <p className="text-sm text-green-900">{result.personalConnection}</p>
                        </div>
                    )}

                    {Array.isArray(result.keyDetails) && result.keyDetails.length > 0 && (
                        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                                Key details
                            </h3>
                            <dl className="divide-y divide-gray-100">
                                {result.keyDetails.map((d, i) => (
                                    <div key={i} className="flex justify-between gap-4 py-2 text-sm">
                                        <dt className="text-neutral-500">{d.label}</dt>
                                        <dd className="text-right font-medium text-neutral-900">{d.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    )}

                    {Array.isArray(result.actions) && result.actions.length > 0 && (
                        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                                What to do
                            </h3>
                            <ul className="space-y-2">
                                {result.actions.map((a, i) => (
                                    <li key={i} className="flex gap-2 text-sm text-neutral-800">
                                        <span className="text-green-600">✓</span>
                                        <span>{a}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {Array.isArray(result.redFlags) && result.redFlags.length > 0 && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
                            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-700">
                                ⚠️ Watch out
                            </h3>
                            <ul className="space-y-2">
                                {result.redFlags.map((r, i) => (
                                    <li key={i} className="text-sm text-red-800">{r}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {result.homeCountryNote && (
                        <div className="rounded-xl border border-gray-200 bg-neutral-50 p-6">
                            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                                Back home, this is like…
                            </h3>
                            <p className="text-sm text-neutral-700">{result.homeCountryNote}</p>
                        </div>
                    )}

                    {/* Ask about this document */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                            Ask about this document
                        </h3>
                        <p className="mb-4 text-sm text-neutral-500">
                            Still unsure about something? Ask a question and the AI will
                            answer using your document.
                        </p>

                        {chat.length > 0 && (
                            <div className="mb-4 space-y-3">
                                {chat.map((m, i) => (
                                    <div
                                        key={i}
                                        className={`flex ${
                                            m.role === 'user' ? 'justify-end' : 'justify-start'
                                        }`}
                                    >
                                        <span
                                            className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                                                m.role === 'user'
                                                    ? 'bg-green-600 text-white'
                                                    : 'bg-gray-100 text-neutral-900'
                                            }`}
                                        >
                                            {m.text}
                                        </span>
                                    </div>
                                ))}
                                {chatLoading && (
                                    <div className="flex justify-start">
                                        <span className="inline-block rounded-lg bg-gray-100 px-3 py-2 text-sm text-neutral-500">
                                            Thinking…
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <input
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        ask();
                                    }
                                }}
                                placeholder="e.g. Why am I being charged this fee?"
                                className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-green-200"
                            />
                            <button
                                type="button"
                                onClick={ask}
                                disabled={chatLoading || !chatInput.trim()}
                                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                            >
                                Ask
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

// Renders the uploaded image with Gemini's bounding boxes overlaid. Boxes come
// as [ymin, xmin, ymax, xmax] normalized 0-1000, so a coord ÷ 10 gives a %.
function AnnotatedImage({ src, annotations, hovered, setHovered }) {
    return (
        <div className="relative inline-block max-w-full">
            <img src={src} alt="document" className="max-w-full rounded-lg" />
            {annotations.map((a, i) => {
                if (!Array.isArray(a.box) || a.box.length !== 4) return null;
                const [ymin, xmin, ymax, xmax] = a.box;
                const active = hovered === i;
                return (
                    <div
                        key={i}
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                            left: `${xmin / 10}%`,
                            top: `${ymin / 10}%`,
                            width: `${(xmax - xmin) / 10}%`,
                            height: `${(ymax - ymin) / 10}%`,
                        }}
                        className={`absolute rounded border-2 transition ${
                            active
                                ? 'border-green-500 bg-green-500/25'
                                : 'border-green-400/70 bg-green-400/10'
                        }`}
                    >
                        <span className="absolute -left-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
                            {i + 1}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
