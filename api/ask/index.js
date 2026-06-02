// /api/state — shared "current scene" for presenter -> phones sync.
// GET  -> { scene }                (public; just a slide number)
// POST -> { scene, token }         (requires PRESENTER_TOKEN app setting)
// State persists in one small blob so it survives across function instances.

const { BlobServiceClient } = require("@azure/storage-blob");

const CONN = process.env.AZURE_STORAGE_CONNECTION;     // storage account connection string
const CONTAINER = "live";
const BLOB = "state.json";
const TOKEN = process.env.PRESENTER_TOKEN || "";       // shared secret used in the presenter URL

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
      await b.upload(data, Buffer.byteLength(data), {
        blobHTTPHeaders: { blobContentType: "application/json" },
      });
      context.res = { status: 200, headers, body: { scene } };
      return;
    }

    context.res = { status: 405, headers, body: { error: "method not allowed" } };
  } catch (e) {
    // Not configured (no storage) or transient error -> let the client fall back to self-guided.
    context.res = { status: 500, headers, body: { error: "state unavailable" } };
  }
};
