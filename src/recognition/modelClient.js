let worker;
let nextId = 0;
const pending = new Map();
export function requestModel(input) {
  if (!worker) {
    worker = new Worker(new URL('./model.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error)); else request.resolve(data);
    };
    worker.onerror = () => {
      for (const request of pending.values()) request.reject(new Error('ASL inference worker failed. Reload to retry.'));
      pending.clear(); worker.terminate(); worker = null;
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, input, base: new URL(import.meta.env.BASE_URL, location.href).href });
  });
}
