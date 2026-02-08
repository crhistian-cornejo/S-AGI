/// <reference lib="webworker" />

interface DecodeRequest {
  id: number;
  base64: string;
}

interface DecodeResponse {
  id: number;
  buffer?: ArrayBuffer;
  error?: string;
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<DecodeRequest>) => {
  const { id, base64 } = event.data;

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    const response: DecodeResponse = { id, buffer: bytes.buffer };
    workerScope.postMessage(response, [bytes.buffer]);
  } catch (error) {
    const response: DecodeResponse = {
      id,
      error: error instanceof Error ? error.message : "Failed to decode base64",
    };
    workerScope.postMessage(response);
  }
};
