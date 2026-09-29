// Use a server-configured public URL behind a reverse proxy, never client-supplied forwarding headers.
export function sameApplicationOrigin(origin: string, internalOrigin: string, configuredUrl?: string) {
  try {
    const expected = new URL(configuredUrl || internalOrigin);
    if (expected.protocol !== "https:" && expected.protocol !== "http:") return false;
    return new URL(origin).origin === expected.origin;
  } catch {
    return false;
  }
}
