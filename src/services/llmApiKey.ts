export const resolveApiKey = (apiKey?: string) => {
  if (apiKey) {
    return apiKey;
  }

  if (typeof import.meta !== "undefined" && import.meta.env) {
    return (
      import.meta.env.VITE_LLM_API_KEY ??
      import.meta.env.VITE_OPENAI_API_KEY ??
      null
    );
  }

  if (typeof globalThis !== "undefined") {
    const maybeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    return maybeProcess?.env?.LLM_API_KEY ?? maybeProcess?.env?.OPENAI_API_KEY ?? null;
  }

  return null;
};
