import express from "express";
import {
    Products,
    CountryCode,
} from "plaid";
import { plaidClient, isPlaidConfigured } from "../services/plaidService.js";
import { getAccessToken, setAccessToken } from "../services/plaidTokenStore.js";
import { getCreditRoadmap } from "../services/geminiService.js";

const router = express.Router();

const ASSET_TYPES = new Set(["depository", "investment"]);
const LIABILITY_TYPES = new Set(["credit", "loan"]);

// "FOOD_AND_DRINK" -> "Food and drink"
function prettyCategory(raw) {
    if (!raw) return "Other";
    const s = raw.replace(/_/g, " ").toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Pull every transaction for the linked item via the sync cursor.
async function fetchAllTransactions() {
    let added = [];
    let cursor = undefined;
    let hasMore = true;
    while (hasMore) {
        const response = await plaidClient.transactionsSync({
            access_token: getAccessToken(),
            cursor,
        });
        added = added.concat(response.data.added);
        hasMore = response.data.has_more;
        cursor = response.data.next_cursor;
    }
    return added;
}

function simplifyTransaction(t) {
    return {
        date: t.date,
        name: t.merchant_name || t.name,
        amount: t.amount, // Plaid: positive = money out, negative = money in
        currency: t.iso_currency_code || "USD",
        category: prettyCategory(t.personal_finance_category?.primary),
        logoUrl: t.logo_url || t.personal_finance_category_icon_url || null,
        pending: t.pending,
    };
}

// Guard every route so a missing config returns a clean error instead of a crash.
router.use((req, res, next) => {
    if (!isPlaidConfigured()) {
        return res.status(503).json({
            error: "Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.",
        });
    }
    next();
});

// 1) Start a Link session — the frontend uses this token to open Plaid Link.
router.post("/create_link_token", async (req, res) => {
    try {
        const response = await plaidClient.linkTokenCreate({
            user: { client_user_id: "finbridge-demo-user" },
            client_name: "FinBridge",
            products: [Products.Transactions],
            country_codes: [CountryCode.Us],
            language: "en",
        });
        res.json({ link_token: response.data.link_token });
    } catch (error) {
        console.error("create_link_token error:", error.response?.data || error.message);
        res.status(500).json({ error: "Failed to create link token" });
    }
});

// 2) Exchange the temporary public_token (from Link success) for an access_token.
router.post("/exchange_public_token", async (req, res) => {
    try {
        const { public_token } = req.body || {};
        if (!public_token) {
            return res.status(400).json({ error: "public_token is required" });
        }
        const response = await plaidClient.itemPublicTokenExchange({ public_token });
        setAccessToken(response.data.access_token);
        res.json({ ok: true });
    } catch (error) {
        console.error("exchange_public_token error:", error.response?.data || error.message);
        res.status(500).json({ error: "Failed to exchange public token" });
    }
});

// Whether an account is currently linked (used by the frontend on load).
router.get("/status", (req, res) => {
    res.json({ linked: Boolean(getAccessToken()) });
});

// 3) The full dashboard payload: accounts, net worth, cash flow, spending, txns.
router.get("/overview", async (req, res) => {
    if (!getAccessToken()) {
        return res.status(400).json({ error: "No linked account. Connect a bank first." });
    }
    try {
        const [acctRes, allTxns] = await Promise.all([
            plaidClient.accountsBalanceGet({ access_token: getAccessToken() }),
            fetchAllTransactions(),
        ]);

        const rawAccounts = acctRes.data.accounts;
        const currency =
            rawAccounts[0]?.balances?.iso_currency_code || "USD";

        const accounts = rawAccounts.map((a) => ({
            id: a.account_id,
            name: a.name,
            mask: a.mask,
            type: a.type,
            subtype: a.subtype,
            current: a.balances.current,
            available: a.balances.available,
            limit: a.balances.limit,
            currency: a.balances.iso_currency_code || currency,
        }));

        const assets = accounts
            .filter((a) => ASSET_TYPES.has(a.type))
            .reduce((s, a) => s + (a.current || 0), 0);
        const liabilities = accounts
            .filter((a) => LIABILITY_TYPES.has(a.type))
            .reduce((s, a) => s + (a.current || 0), 0);

        // Cash flow + spending over the last 30 days.
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const recentWindow = allTxns.filter((t) => t.date >= cutoffStr);

        let income = 0;
        let spending = 0;
        const byCategory = {};
        for (const t of recentWindow) {
            if (t.amount > 0) {
                spending += t.amount;
                const cat = prettyCategory(t.personal_finance_category?.primary);
                byCategory[cat] = (byCategory[cat] || 0) + t.amount;
            } else {
                income += -t.amount;
            }
        }

        const spendingByCategory = Object.entries(byCategory)
            .map(([category, amount]) => ({
                category,
                amount: Number(amount.toFixed(2)),
            }))
            .sort((a, b) => b.amount - a.amount);

        const transactions = allTxns
            .slice()
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .slice(0, 15)
            .map(simplifyTransaction);

        res.json({
            currency,
            summary: {
                netWorth: Number((assets - liabilities).toFixed(2)),
                assets: Number(assets.toFixed(2)),
                liabilities: Number(liabilities.toFixed(2)),
            },
            cashFlow: {
                period: "Last 30 days",
                income: Number(income.toFixed(2)),
                spending: Number(spending.toFixed(2)),
                net: Number((income - spending).toFixed(2)),
            },
            spendingByCategory,
            accounts,
            transactions,
        });
    } catch (error) {
        console.error("overview error:", error.response?.data || error.message);
        res.status(500).json({ error: "Failed to load account overview" });
    }
});

// 4) Credit-building roadmap derived from the linked accounts. NOTE: Plaid does
// not provide a credit score here — we compute *signals* and let Gemini coach.
router.get("/credit-roadmap", async (req, res) => {
    if (!getAccessToken()) {
        return res.status(400).json({ error: "No linked account. Connect a bank first." });
    }
    try {
        const [acctRes, allTxns] = await Promise.all([
            plaidClient.accountsBalanceGet({ access_token: getAccessToken() }),
            fetchAllTransactions(),
        ]);
        const accounts = acctRes.data.accounts;

        const creditAccounts = accounts.filter((a) => a.type === "credit");
        const depository = accounts.filter((a) => a.type === "depository");

        const creditLimit = creditAccounts.reduce(
            (s, a) => s + (a.balances.limit || 0),
            0
        );
        const creditBalance = creditAccounts.reduce(
            (s, a) => s + (a.balances.current || 0),
            0
        );
        const cashReserves = depository.reduce(
            (s, a) => s + (a.balances.available ?? a.balances.current ?? 0),
            0
        );

        // 30-day spending, to express reserves as months of buffer.
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const spending = allTxns
            .filter((t) => t.date >= cutoffStr && t.amount > 0)
            .reduce((s, t) => s + t.amount, 0);

        const signals = {
            hasCreditCard: creditAccounts.length > 0,
            creditCardCount: creditAccounts.length,
            creditUtilizationPct:
                creditLimit > 0
                    ? Math.round((creditBalance / creditLimit) * 100)
                    : null,
            hasRevolvingBalance: creditBalance > 0,
            cashReserves: Number(cashReserves.toFixed(2)),
            monthsOfBuffer:
                spending > 0 ? Number((cashReserves / spending).toFixed(1)) : null,
            hasLoans: accounts.some((a) => a.type === "loan"),
            currency: accounts[0]?.balances?.iso_currency_code || "USD",
        };

        const { language, culture } = req.query;
        const roadmap = await getCreditRoadmap({
            signals,
            language: language || "en",
            culture: culture || "American",
        });

        res.json({ signals, roadmap });
    } catch (error) {
        console.error("credit-roadmap error:", error.response?.data || error.message);
        const body = { error: "Failed to build credit roadmap" };
        if (process.env.NODE_ENV !== "production") {
            body.detail = error?.message;
        }
        res.status(500).json(body);
    }
});

export default router;
