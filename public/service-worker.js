const downloads = {};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data.type === 'DOWNLOAD') {
    handleDownload(data.archive, data.offset || 0, event.source, data.start, data.end);
  } else if (data.type === 'ABORT') {
    const d = downloads[data.archive?.name];
    d && d.controller.abort();
  }
});

async function handleDownload(archive, offset, client, start, end) {
  let state = downloads[archive.name];
  if (!state || offset === 0) {
    state = { chunks: [], received: 0, total: archive.size };
  }
  const controller = new AbortController();
  state.controller = controller;
  downloads[archive.name] = state;

  try {
    const params = new URLSearchParams();
    params.append('name', archive.name);
    if (start) params.append('start', start);
    if (end) params.append('end', end);

    const response = await fetch(`/api/bulk-download/archives/download-archive?${params.toString()}`, {
      headers: offset ? { Range: `bytes=${offset}-` } : {},
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const contentRange = response.headers.get('Content-Range');
    state.total = contentRange ? parseInt(contentRange.split('/')[1], 10) : archive.size;
    const reader = response.body.getReader();
    state.received = offset;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      state.chunks.push(value);
      state.received += value.byteLength;
      client.postMessage({ type: 'PROGRESS', name: archive.name, received: state.received, total: state.total });
    }

    const blob = new Blob(state.chunks);
    const url = URL.createObjectURL(blob);
    client.postMessage({
      type: 'DOWNLOAD_READY',
      name: archive.name,
      url,
      isBlob: true,
    });
    delete downloads[archive.name];
  } catch (error) {
    if (error.name !== 'AbortError') {
      client.postMessage({
        type: 'ERROR',
        name: archive.name,
        error: error.message,
      });
    }
  }
}
