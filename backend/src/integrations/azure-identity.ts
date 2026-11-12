/**
 * G3 / G5 (D-113, D-115): access tokens from the App Service's managed identity, so no Azure key or
 * connection string exists anywhere. One token per resource, cached until five minutes before expiry.
 */
export interface IdentityOptions {
  /** A user-assigned identity's client id; empty for the system-assigned one. */
  clientId?: string | undefined;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export function managedIdentityToken(resource: string, { clientId, env = process.env, fetchImpl = fetch }: IdentityOptions = {}): () => Promise<string> {
  let cached: { token: string; until: number } | undefined;
  return async () => {
    if (cached && cached.until > Date.now()) return cached.token;
    const q = new URLSearchParams({ resource, ...(clientId ? { client_id: clientId } : {}) });
    // App Service gives IDENTITY_ENDPOINT + IDENTITY_HEADER; a VM or container host has the metadata endpoint.
    const res = env.IDENTITY_ENDPOINT
      ? await fetchImpl(`${env.IDENTITY_ENDPOINT}?api-version=2019-08-01&${q}`, { headers: { 'X-IDENTITY-HEADER': env.IDENTITY_HEADER ?? '' } })
      : await fetchImpl(`http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&${q}`, { headers: { Metadata: 'true' } });
    if (!res.ok) throw new Error(`Managed identity token failed (${res.status}).`);
    const body = (await res.json()) as { access_token: string; expires_on: string | number };
    cached = { token: body.access_token, until: Number(body.expires_on) * 1000 - 5 * 60_000 };
    return cached.token;
  };
}
