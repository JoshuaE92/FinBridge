import {
    Configuration,
    PlaidApi,
    PlaidEnvironments,
} from "plaid";
import { getAccessToken } from "./plaidTokenStore.js";

// Resolve the Plaid environment (sandbox by default) from env.
const PLAID_ENV = process.env.PLAID_ENV || "sandbox";
const basePath = PlaidEnvironments[PLAID_ENV] || PlaidEnvironments.sandbox;

const configuration = new Configuration({
    basePath,
    baseOptions: {
        headers: {
            "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
            "PLAID-SECRET": process.env.PLAID_SECRET,
        },
    },
});

export const plaidClient = new PlaidApi(configuration);

export function isPlaidConfigured() {
    return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

// A compact snapshot of the linked user's balances, for grounding the "Explain
// This" answer in their real finances. Returns null when no bank is linked.
export async function getFinancialContext() {
    const token = getAccessToken();
    if (!token) return null;

    try {
        const res = await plaidClient.accountsBalanceGet({ access_token: token });
        const accounts = res.data.accounts;
        const currency = accounts[0]?.balances?.iso_currency_code || "USD";
        const round = (n) => Number(n.toFixed(2));

        const cashAvailable = accounts
            .filter((a) => a.type === "depository")
            .reduce((s, a) => s + (a.balances.available ?? a.balances.current ?? 0), 0);
        const assets = accounts
            .filter((a) => ["depository", "investment"].includes(a.type))
            .reduce((s, a) => s + (a.balances.current || 0), 0);
        const liabilities = accounts
            .filter((a) => ["credit", "loan"].includes(a.type))
            .reduce((s, a) => s + (a.balances.current || 0), 0);

        return {
            currency,
            cashAvailable: round(cashAvailable),
            checkingBalance: accounts.find((a) => a.subtype === "checking")?.balances?.current ?? null,
            savingsBalance: accounts.find((a) => a.subtype === "savings")?.balances?.current ?? null,
            netWorth: round(assets - liabilities),
        };
    } catch (error) {
        console.error("getFinancialContext error:", error.response?.data || error.message);
        return null;
    }
}
