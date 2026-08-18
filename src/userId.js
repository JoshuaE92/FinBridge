// A stable per-browser user id so the backend can store documents and give the
// agent memory — no login required yet. (Swap for real auth later.)
const KEY = 'finbridge_uid';

export function getUserId() {
    let id = localStorage.getItem(KEY);
    if (!id) {
        id =
            typeof crypto !== 'undefined' && crypto.randomUUID
                ? `u_${crypto.randomUUID()}`
                : `u_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(KEY, id);
    }
    return id;
}
