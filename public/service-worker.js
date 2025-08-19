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
  
  try {
    // For new downloads (offset = 0), trigger browser download directly
    if (offset === 0) {
      // Build download URL with time range parameters if provided
      const params = new URLSearchParams();
      params.append('name', archive.name);
      if (start) params.append('start', start);
      if (end) params.append('end', end);
      
      const downloadUrl = `/api/bulk-download/archives/download-archive?${params.toString()}`;
      
      // Trigger browser download by creating a temporary link
      client.postMessage({ 
        type: 'DOWNLOAD_READY', 
        name: archive.name, 
        url: downloadUrl 
      });
      return;
    }
    
    // For resumable downloads - build URL with time range parameters
    const params = new URLSearchParams();
    params.append('name', archive.name);
    if (start) params.append('start', start);
    if (end) params.append('end', end);
    
    const response = await fetch(`/api/bulk-download/archives/download-archive?${params.toString()}`, {
      headers: { Range: `bytes=${offset}-` },
      signal: controller.signal,
    });
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    
    const contentRange = response.headers.get('Content-Range');
    const total = contentRange ? parseInt(contentRange.split('/')[1], 10) : archive.size;
    const reader = response.body.getReader();
    const chunks = [];
    let received = offset;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      client.postMessage({ type: 'PROGRESS', name: archive.name, received, total });
    }
    
    // Create blob and download
    const blob = new Blob(chunks);
    const url = URL.createObjectURL(blob);
    client.postMessage({ 
      type: 'DOWNLOAD_READY', 
      name: archive.name, 
      url: url,
      isBlob: true 
    });
    
  } catch (error) {
    client.postMessage({ 
      type: 'ERROR', 
      name: archive.name, 
      error: error.message 
    });
  }
}
