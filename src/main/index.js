/**
 * Main Process Entry Point
 * Electron main process initialization with System Tray support
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const database = require('./database');
const { registerIpcHandlers, unregisterIpcHandlers, setSSHManager } = require('./ipc-handlers');
const { SSHManager } = require('./ssh-manager');
const { TrayManager } = require('./tray-manager');

// Hot reload for development (disabled due to compatibility issues)
if (process.env.NODE_ENV === 'development') {
  // Auto-set master key for development convenience
  const crypto = require('./crypto');
  crypto.setMasterKey('dev-master-key-for-testing-only');
  console.log('[DEV] Auto-set master key for development');
}

// Global references
let mainWindow = null;
let sshManager = null;
let trayManager = null;

// Platform detection
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

/**
 * Create main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      // Security settings
      contextIsolation: true,
      nodeIntegration: false,
      // Preload script will be set by Agent 2
      preload: path.join(__dirname, '../renderer/preload.js'),
    },
    show: false, // Don't show until ready-to-show
    titleBarStyle: 'default',
    // macOS: Hide dock icon initially if we want tray-only mode
    // skipTaskbar: false, // Show in taskbar/dock
  });

  // Load renderer HTML
  const indexPath = path.join(__dirname, '../renderer/index.html');
  mainWindow.loadFile(indexPath);

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // macOS: Show dock icon when window is shown
    if (isMac) {
      app.dock.show();
    }
    
    // Uncomment to auto-open DevTools in development
    // if (process.env.NODE_ENV === 'development') {
    //   mainWindow.webContents.openDevTools();
    // }
  });

  // Handle window close - now managed by TrayManager
  // Don't set mainWindow to null here, let TrayManager handle it
  mainWindow.on('closed', () => {
    // Only nullify if we're actually quitting
    if (!trayManager || trayManager.isQuitting) {
      mainWindow = null;
    }
  });

  // Handle new window requests (security)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only allow specific URLs or handle externally
    console.log('Blocked new window request:', url);
    return { action: 'deny' };
  });
}

/**
 * Initialize application
 */
function initialize() {
  try {
    // Initialize database
    database.initDatabase();
    
    // Create SSH Manager instance
    sshManager = new SSHManager(mainWindow);
    setSSHManager(sshManager);
    
    // Create Tray Manager (handles tray icon and window behavior)
    trayManager = new TrayManager(mainWindow, sshManager);
    
    // Update SSH Manager's mainWindow reference for tray updates
    sshManager.setMainWindow(mainWindow);
    
    // Register IPC handlers
    registerIpcHandlers();
    
    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    app.quit();
  }
}

/**
 * Cleanup before quit
 */
function cleanup() {
  // Mark as quitting so tray manager knows
  if (trayManager) {
    trayManager.isQuitting = true;
  }
  
  // Disconnect all SSH tunnels
  if (sshManager) {
    sshManager.disconnectAll();
    sshManager = null;
  }
  
  // Destroy tray
  if (trayManager) {
    trayManager.destroy();
    trayManager = null;
  }
  
  unregisterIpcHandlers();
  database.closeDatabase();
}

// App event handlers

// App ready
app.whenReady().then(() => {
  // Create window first (needed by SSHManager)
  createWindow();
  
  // Then initialize (SSHManager needs mainWindow)
  initialize();

  // macOS: Recreate window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow && trayManager) {
      // Show existing window
      trayManager.showWindow();
    }
  });
});

// All windows closed
app.on('window-all-closed', () => {
  // macOS: Keep app running in background (tray icon remains)
  // unless Cmd+Q was pressed (isQuitting flag)
  if (isMac) {
    if (!trayManager || trayManager.isQuitting) {
      app.quit();
    }
    // Otherwise, keep running with tray icon
  } else {
    // Windows/Linux: Quit when window is closed (unless tray is active)
    if (!trayManager || trayManager.isQuitting) {
      app.quit();
    }
  }
});

// App will quit
app.on('will-quit', (event) => {
  cleanup();
});

// App before quit
app.on('before-quit', () => {
  if (trayManager) {
    trayManager.isQuitting = true;
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    console.log('Blocked new window:', navigationUrl);
  });
});

// Handle certificate errors (for development only)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(false);
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is already running');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Focus existing window if second instance tried to start
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
    }
  });
}

// Export for IPC handlers that need to update tray
module.exports = {
  getTrayManager: () => trayManager,
};
