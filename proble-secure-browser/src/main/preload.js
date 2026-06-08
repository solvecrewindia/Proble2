const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // We will expose secure IPC methods here later
  // Example: sendAlert: (alertData) => ipcRenderer.send('send-alert', alertData)
});

// [DEV-ONLY] Inject a floating button to easily exit the kiosk mode during testing.
// (Remove this DOM listener before production)
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.createElement('button');
  btn.textContent = 'DEV: Exit Kiosk';
  btn.style.position = 'fixed';
  btn.style.bottom = '20px';
  btn.style.right = '20px';
  btn.style.zIndex = '999999';
  btn.style.padding = '12px 20px';
  btn.style.background = '#ef4444';
  btn.style.color = 'white';
  btn.style.border = 'none';
  btn.style.borderRadius = '8px';
  btn.style.fontWeight = 'bold';
  btn.style.cursor = 'pointer';
  btn.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)';

  btn.addEventListener('click', () => ipcRenderer.send('dev-quit'));
  
  document.body.appendChild(btn);
});
