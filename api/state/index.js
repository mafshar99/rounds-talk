// /api/state — shared "current scene" for presenter -> phones sync.
// GET            -> { scene }
// GET ?selftest=1 -> { ok, container, detail }  (diagnoses the storage connection)
// POST { scene, token } -> writes (requires PRESENTER_TOKEN)

const { BlobServiceClient } = require("@azure/storage-blob");

const CONN = process.env.AZURE_STORAGE_CONNECTION;
const CONTAINER = "live";
const BLOB = "state.json";
const TOKEN = process.env.PRESENTER_TOKEN || "";

function streamToString(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (d) => chunks.push(d.toString()));
    readable.on("end", () => resolve(chunks.join("")));
    readable.on("error", reject);
  });
}

async function blobClient() {
  const svc = BlobServiceClient.fromConnectionString(CONN);
  const cont = svc.getContainerClient(CONTAINER);
  await cont.createIfNotExists();
  return cont.getBlockBlobClient(BLOB);
}

async function readState() {
  try {
    const b = await blobClient();
    const dl = await b.download();
    return JSON.parse(await streamToString(dl.readableStreamBody));
  } catch (e) {
    return { scene: 0 };
  }
}

module.exports = async function (context, req) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  try {
    if (req.method === "GET") {
      // self-test: open /api/state?selftest=1 in a browser
      if (req.query && req.query.selftest) {
        if (!CONN) { context.res = { status: 200, headers, body: { ok: false, detail: "AZURE_STORAGE_CONNECTION is not set" } }; return; }
        try {
          const b = await blobClient();
          await b.upload("{\"scene\":0,\"ping\":1}", 19, { blobHTTPHeaders: { blobContentType: "application/json" } });
          context.res = { status: 200, headers, body: { ok: true, container: CONTAINER, detail: "storage read/write OK" } };
        } catch (e) {
          context.res = { status: 200, headers, body: { ok: false, detail: (e && e.message) || String(e) } };
        }
        return;
      }
      const state = await readState();
      context.res = { status: 200, headers, body: state };
      return;
    }

    if (req.method === "POST") {
      const body = req.body || {};
      if (!TOKEN || body.token !== TOKEN) {
        context.res = { status: 401, headers, body: { error: "unauthorized" } };
        return;
      }
      const scene = Number(body.scene) || 0;
      const b = await blobClient();
      const data = JSON.stringify({ scene, ts: Date.now() });
      await b.upload(data, Buffer.byteLength(data), { blobHTTPHeaders: { blobContentType: "application/json" } });
      context.res = { status: 200, headers, body: { scene } };
      return;
    }

    context.res = { status: 405, headers, body: { error: "method not allowed" } };
  } catch (e) {
    context.res = { status: 500, headers, body: { error: "state unavailable", detail: (e && e.message) || String(e) } };
  }
};
