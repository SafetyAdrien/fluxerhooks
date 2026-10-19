// Pont exposé à l'interface (window.fluxerDesktop) — voir src/platform/desktop.ts.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fluxerDesktop', {
  platform: process.platform,
  version: ipcRenderer.sendSync('app:version'),
  secret: {
    get: (key) => ipcRenderer.invoke('secret:get', key),
    set: (key, value) => ipcRenderer.invoke('secret:set', key, value),
    del: (key) => ipcRenderer.invoke('secret:del', key),
  },
  files: {
    save: (name, text) => ipcRenderer.invoke('files:save', name, text),
    store: (name, data) => ipcRenderer.invoke('files:store', name, data),
    remove: (url) => ipcRenderer.invoke('files:remove', url),
  },
  altcha: {
    solve: (opts) => ipcRenderer.invoke('altcha:solve', opts),
    cancel: () => ipcRenderer.invoke('altcha:cancel'),
    onProgress: (cb) => {
      const listener = (_e, data) => cb(data);
      ipcRenderer.on('altcha:progress', listener);
      return () => ipcRenderer.removeListener('altcha:progress', listener);
    },
  },
  setBackground: (enabled) => ipcRenderer.invoke('app:background', !!enabled),
  link: {
    hostname: ipcRenderer.sendSync('app:hostname'),
    localAddresses: () => ipcRenderer.invoke('link:addresses'),
    request: (url, method, body, timeoutMs) => ipcRenderer.invoke('link:request', url, method, body, timeoutMs),
    serve: (on) => ipcRenderer.invoke('link:serve', !!on),
    port: () => ipcRenderer.invoke('link:port'),
    liveConnect: (url) => ipcRenderer.invoke('link:live-connect', url),
    liveSend: (id, data) => ipcRenderer.send('link:live-send', id, data),
    liveClose: (id) => ipcRenderer.send('link:live-close', id),
    onLive: (cb) => {
      const listener = (_e, msg) => cb(msg);
      ipcRenderer.on('link:live', listener);
      return () => ipcRenderer.removeListener('link:live', listener);
    },
    onRequest: (handler) => {
      const listener = async (_e, req) => {
        let res;
        try {
          res = await handler(req);
        } catch (err) {
          res = { status: 500, body: JSON.stringify({ error: 'renderer_error' }) };
        }
        ipcRenderer.send('link:response', { id: req.id, status: res.status, body: res.body });
      };
      ipcRenderer.on('link:request', listener);
      return () => ipcRenderer.removeListener('link:request', listener);
    },
  },
});
