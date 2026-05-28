function trimTrailingSlash(url) {
  return String(url ?? "").replace(/\/+$/, "");
}

export function createHesaClient({ baseUrl, apiKey } = {}) {
  if (!baseUrl) {
    throw new Error("baseUrl is required");
  }

  const normalizedBaseUrl = trimTrailingSlash(baseUrl);

  async function request(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${normalizedBaseUrl}${path}`, {
      ...options,
      headers,
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message =
        payload?.message ?? payload?.error ?? `Request failed with status ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  return {
    async health() {
      return request("/health", { method: "GET" });
    },
    async demo() {
      return request("/demo", { method: "GET" });
    },
    async run({ prompt }) {
      if (!prompt || typeof prompt !== "string") {
        throw new Error("prompt (string) is required");
      }

      return request("/run", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });
    },
  };
}
