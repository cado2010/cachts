// The only desktop features the page can reach. See CachDesktop in web/src/browser.ts.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('cachDesktop', {
  onCloseRequested(handler: () => void): () => void {
    const listener = (): void => handler();
    ipcRenderer.on('cach:close-requested', listener);
    ipcRenderer.send('cach:close-handler', true);
    return () => {
      ipcRenderer.send('cach:close-handler', false);
      ipcRenderer.off('cach:close-requested', listener);
    };
  },
  confirmClose(): void {
    ipcRenderer.send('cach:close-confirmed');
  },
});
