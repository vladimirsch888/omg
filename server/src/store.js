const fs = require('fs/promises');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'banners.json');

// Requests are infrequent (a handful of admin edits + periodic polling
// reads), so a single in-memory write queue is enough to avoid concurrent
// read-modify-write races on the JSON file - no database needed.
let writeQueue = Promise.resolve();

async function readAll() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

async function writeAll(data) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmpFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpFile, DATA_FILE);
}

async function getBanner(domain) {
  const all = await readAll();
  return all[domain] || { text: '', updatedAt: null };
}

function setBanner(domain, text) {
  writeQueue = writeQueue.then(async () => {
    const all = await readAll();
    all[domain] = { text, updatedAt: new Date().toISOString() };
    await writeAll(all);
    return all[domain];
  });
  return writeQueue;
}

module.exports = { getBanner, setBanner };
