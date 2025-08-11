const controllers = {};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data.type === 'DOWNLOAD') {
    handleDownload(data.archive, data.offset || 0, event.source, data.start, data.end);
  } else if (data.type === 'ABORT') {
    const c = controllers[data.archive?.name];
    c && c.abort();
  }
});

async function handleDownload(archive, offset, client, start, end) {
  const controller = new AbortController();
  controllers[archive.name] = controller;
  const params = new URLSearchParams();
  if (start) params.append('start', start);
  if (end) params.append('end', end);
  const qs = params.toString();
  const url = qs
    ? `/bulk-download/archives/${archive.name}?${qs}`
    : `/bulk-download/archives/${archive.name}`;
  const response = await fetch(url, {
    headers: { Range: `bytes=${offset}-` },
    signal: controller.signal,
  });
  const contentRange = response.headers.get('Content-Range');
  const total = contentRange ? parseInt(contentRange.split('/')[1], 10) : archive.size;
  const reader = response.body.getReader();
  let received = offset;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    client.postMessage({ type: 'PROGRESS', name: archive.name, received, total });
  }
}
