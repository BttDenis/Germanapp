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

  if (typeof process !== "undefined") {
    return process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? null;
  }

  return null;
};
