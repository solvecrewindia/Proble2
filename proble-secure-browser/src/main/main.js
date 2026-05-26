const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: true, // Kiosk Windowing: enforce Fullscreen
    kiosk: true,      // Real Kiosk Mode
    alwaysOnTop: true, // Always on top
    resizable: false, // No window resizing
    movable: false,
    skipTaskbar: true, // Hide taskbars
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load the Vite dev server running in the parent directory, or fallback to index.html
  mainWindow.loadURL('http://localhost:5173').catch(() => {
    mainWindow.loadFile(path.join(__dirname, '../../index.html'));
  });

  // Auto-launch configurations: block basic window exit shortcuts
  mainWindow.on('close', (e) => {
    // For now we allow closing, but in Week 5-6 this will be hooked to exit protection
    console.log('Close event triggered');
  });
}

app.whenReady().then(() => {
  createWindow();

  // Block basic exit shortcuts (Aarya will add OS-level hooks later for Alt+Tab, Win, etc.)
  globalShortcut.register('CommandOrControl+W', () => {
    console.log('Ctrl+W blocked');
  });
  
  globalShortcut.register('CommandOrControl+Q', () => {
    console.log('Ctrl+Q blocked');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // [DEV-ONLY] Listen for quit from the injected test button (Remove this listener in production)
  ipcMain.on('dev-quit', () => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
