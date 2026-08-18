import {
    Configuration,
    PlaidApi,
    PlaidEnvironments,
} from "plaid";

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
