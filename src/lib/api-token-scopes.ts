export const apiTokenScopes = ["tasks:read", "tasks:write", "verifications:run", "datasets:read", "jobs:read"] as const;
export type ApiTokenScope = (typeof apiTokenScopes)[number];
