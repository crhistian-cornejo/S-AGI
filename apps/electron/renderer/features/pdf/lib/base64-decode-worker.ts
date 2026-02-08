interface DecodeRequest {
  id: number;
  base64: string;
}

interface DecodeResponse {
  id: number;
  buffer?: ArrayBuffer;
  error?: string;
}

type PendingDecode = {
  resolve: (bytes: Uint8Array) => void;
  reject: (error: Error) => void;
};

let decodeWorker: Worker | null = null;
let requestId = 0;
const pendingDecodes = new Map<number, PendingDecode>();

function getDecodeWorker(): Worker {
  if (decodeWorker) return decodeWorker;

  decodeWorker = new Worker(
    new URL("../workers/base64-decode.worker.ts", import.meta.url),
    { type: "module" },
  );

  decodeWorker.onmessage = (event: MessageEvent<DecodeResponse>) => {
    const { id, buffer, error } = event.data;
    const pending = pendingDecodes.get(id);
    if (!pending) return;

    pendingDecodes.delete(id);
    if (error) {
      pending.reject(new Error(error));
      return;
    }

    if (!buffer) {
      pending.reject(new Error("Worker returned empty decode result"));
      return;
    }

    pending.resolve(new Uint8Array(buffer));
  };

  decodeWorker.onerror = (event) => {
    const message = event.message || "Base64 worker crashed";
    for (const [, pending] of pendingDecodes) {
      pending.reject(new Error(message));
    }
    pendingDecodes.clear();
  };

  return decodeWorker;
}

export function decodeBase64InWorker(base64: string): Promise<Uint8Array> {
  const worker = getDecodeWorker();
  const id = ++requestId;

  return new Promise((resolve, reject) => {
    pendingDecodes.set(id, { resolve, reject });
    const request: DecodeRequest = { id, base64 };
    worker.postMessage(request);
  });
}
