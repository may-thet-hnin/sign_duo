import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import mjsUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import { validateClasses } from './preprocessing.js';

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
let model;
async function load(base) {
  const response = await fetch(`${base}models/asl/mlp_classes.json`);
  if (!response.ok) throw new Error('Could not load ASL class mapping');
  const classes = validateClasses(await response.json());
  const session = await ort.InferenceSession.create(`${base}models/asl/mlp_asl.onnx`, { executionProviders: ['wasm'] });
  if (session.inputNames.length !== 1 || session.outputNames.length !== 1) throw new Error('Unexpected ASL model interface');
  return { session, classes };
}
// One session and a serialized queue, also when two cameras share the worker.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      // A failed download is not cached, so the next camera can retry it.
      model ??= load(data.base).catch(error => { model = undefined; throw error; });
      const { session, classes } = await model;
      if (!data.input) { self.postMessage({ id: data.id, ready: true }); return; }
      const start = performance.now();
      const output = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', data.input, [1, 63]) });
      const tensor = output[session.outputNames[0]];
      if (tensor.dims.length !== 2 || tensor.dims[0] !== 1 || tensor.dims[1] !== 36) throw new Error('Unexpected ASL output dimensions');
      self.postMessage({ id: data.id, logits: Array.from(tensor.data), classes, latencyMs: performance.now() - start });
    } catch (error) { self.postMessage({ id: data.id, error: error.message }); }
  });
};
