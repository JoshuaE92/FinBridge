// DEMO-ONLY shared token store. A real app would persist the access_token per
// user in a database; for the sandbox demo we keep the most recent one in
// memory so multiple features (dashboard, credit roadmap, explain) can use it.
let accessToken = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => {
    accessToken = token;
};
