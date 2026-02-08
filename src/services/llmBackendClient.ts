const DEFAULT_LLM_BACKEND_URL = import.meta.env.DEV ? "http://localhost:8787" : "";

const configuredBaseUrl =
  import.meta.env.VITE_LLM_BACKEND_URL ??
  import.meta.env.VITE_BACKEND_URL ??
  DEFAULT_LLM_BACKEND_URL;

const baseUrl = configuredBaseUrl ? configuredBaseUrl.replace(/\/$/, "") : "";
const backendToken =
  import.meta.env.VITE_LLM_BACKEND_TOKEN ??
  import.meta.env.VITE_WORD_SYNC_TOKEN ??
  "";

export const getLlmBackendEndpoint = (path: string) => {
  if (!baseUrl) {
    throw new Error("LLM backend URL not configured. Set VITE_LLM_BACKEND_URL.");
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
};

export const buildLlmBackendHeaders = () => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (backendToken) {
    headers.Authorization = `Bearer ${backendToken}`;
  }
  return headers;
};

export const parseErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as { error?: string; message?: string };
    return payload.error ?? payload.message ?? `${fallback} (${response.status}).`;
  } catch {
    return `${fallback} (${response.status}).`;
  }
};
