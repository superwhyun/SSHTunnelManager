/**
 * Tray Manager
 * Handles system tray integration for macOS and Windows
 */

const { Tray, Menu, nativeImage, app, BrowserWindow } = require('electron');
const path = require('path');

class TrayManager {
  constructor(mainWindow, sshManager) {
    this.mainWindow = mainWindow;
    this.sshManager = sshManager;
    this.tray = null;
    this.isQuitting = false;

    // Platform detection
    this.isMac = process.platform === 'darwin';
    this.isWindows = process.platform === 'win32';
    this.isLinux = process.platform === 'linux';

    // Window close behavior
    this.minimizeToTray = true; // Default: minimize to tray on close

    this.init();
  }

  /**
   * Initialize tray icon and menu
   */
  init() {
    this.createTray();
    this.setupWindowHandlers();
    console.log(`[Tray] Initialized on ${process.platform}`);
  }

  /**
   * Create tray icon
   */
  createTray() {
    const iconPath = this.getIconPath();
    console.log('[Tray] Icon path:', iconPath);

    try {
      // Check if icon file exists
      const fs = require('fs');
      if (!fs.existsSync(iconPath)) {
        console.error('[Tray] Icon file not found:', iconPath);
        // Create a fallback empty icon
        this.createFallbackTray();
        return;
      }

      // Create native image
      let trayIcon = nativeImage.createFromPath(iconPath);

      if (trayIcon.isEmpty()) {
        console.error('[Tray] Icon image is empty, trying fallback');
        this.createFallbackTray();
        return;
      }

      if (this.isMac) {
        // macOS: Use template image for dark mode support
        trayIcon.setTemplateImage(true);
        // Resize for macOS tray (18x18 is standard for Retina support)
        trayIcon = trayIcon.resize({ width: 18, height: 18 });
      } else if (this.isWindows) {
        // Windows: Use 16x16 icon
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
      } else {
        // Linux
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
      }

      this.tray = new Tray(trayIcon);
      this.tray.setToolTip('SSH Tunnel Manager');

      // Setup event handlers
      this._setupTrayHandlers();

      // Update context menu
      this.updateContextMenu();

      console.log('[Tray] Tray created successfully');

    } catch (error) {
      console.error('[Tray] Failed to create tray:', error);
      this.createFallbackTray();
    }
  }

  /**
   * Create fallback tray with no icon (text only)
   */
  createFallbackTray() {
    try {
      this.tray = new Tray(nativeImage.createEmpty());
      this.tray.setTitle('🔌'); // Use emoji as fallback
      this.tray.setToolTip('SSH Tunnel Manager');

      // Setup event handlers for fallback too
      this._setupTrayHandlers();

      this.updateContextMenu();
      console.log('[Tray] Fallback tray created with emoji');
    } catch (error) {
      console.error('[Tray] Failed to create fallback tray:', error);
    }
  }

  /**
   * Setup tray event handlers (common for both normal and fallback tray)
   */
  _setupTrayHandlers() {
    if (!this.tray) return;

    if (this.isMac) {
      // macOS: 
      // - Left click: Toggle window
      // - Right click: Show context menu
      this.tray.on('click', (event, bounds) => {
        console.log('[Tray] Left click detected');
        this.toggleWindow();
      });

      this.tray.on('right-click', (event, bounds) => {
        console.log('[Tray] Right click detected');
        this.updateContextMenu();
        // Use stored menu for macOS
        if (this._contextMenu) {
          this.tray.popUpContextMenu(this._contextMenu);
        }
      });
    } else {
      // Windows/Linux: Standard behavior
      this.tray.on('click', () => {
        console.log('[Tray] Click detected');
        this.toggleWindow();
      });
      this.tray.on('right-click', () => {
        console.log('[Tray] Right click detected');
        this.updateContextMenu();
        this.tray.popUpContextMenu();
      });
    }
  }

  /**
   * Get icon path based on platform
   */
  getIconPath() {
    const fs = require('fs');

    // Try multiple possible paths (for dev and production)
    const possiblePaths = [
      // Development path
      path.join(__dirname, '../../assets'),
      // Production path (packed app)
      path.join(process.resourcesPath, 'assets'),
      // Alternative paths
      path.join(__dirname, '../assets'),
      path.join(app.getAppPath(), 'assets'),
    ];

    const iconName = this.isMac ? 'trayTemplate.png' :
      this.isWindows ? 'tray.ico' : 'tray.png';

    for (const assetsPath of possiblePaths) {
      const iconPath = path.join(assetsPath, iconName);
      if (fs.existsSync(iconPath)) {
        console.log('[Tray] Found icon at:', iconPath);
        return iconPath;
      }
    }

    // Return default path (will fail gracefully)
    console.warn('[Tray] Icon not found in any path, returning default');
    return path.join(__dirname, '../../assets', iconName);
  }

  /**
   * Update tray context menu based on current state
   */
  updateContextMenu() {
    if (!this.tray) return;

    const connections = this.sshManager ? this.sshManager.getActiveConnections() : [];
    const connectedCount = connections.filter(c => c.status === 'connected').length;
    const isWindowVisible = this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.isVisible();

    const template = [
      {
        label: 'SSH Tunnel Manager',
        enabled: false,
      },
      {
        label: connectedCount > 0
          ? `🔌 ${connectedCount} tunnel${connectedCount > 1 ? 's' : ''} connected`
          : '⭕ No active tunnels',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: isWindowVisible ? 'Hide Window' : 'Show Window',
        click: () => this.toggleWindow(),
      },
      { type: 'separator' },
      // Quick actions for each connected tunnel
      ...this.getTunnelMenuItems(),
      { type: 'separator' },
      {
        label: 'Connect All',
        click: () => this.connectAll(),
      },
      {
        label: 'Disconnect All',
        click: () => this.disconnectAll(),
      },
      { type: 'separator' },
      {
        label: 'Minimize to Tray on Close',
        type: 'checkbox',
        checked: this.minimizeToTray,
        click: (item) => {
          this.minimizeToTray = item.checked;
          this.saveSettings();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => this.quitApp(),
      },
    ];

    const contextMenu = Menu.buildFromTemplate(template);

    // macOS: Don't set context menu (causes issues with click events)
    // Windows/Linux: Set context menu for both left and right click
    if (this.isMac) {
      // Store menu for popUpContextMenu to use later
      this._contextMenu = contextMenu;
      // Don't call setContextMenu on macOS - it interferes with left-click
    } else {
      this.tray.setContextMenu(contextMenu);
    }
  }

  /**
   * Get menu items for active tunnels
   */
  getTunnelMenuItems() {
    if (!this.sshManager) return [];

    const connections = this.sshManager.getActiveConnections();
    if (connections.length === 0) return [];

    return connections.map(conn => ({
      label: `${conn.status === 'connected' ? '🔵' : '🟡'} ${conn.name || conn.id}`,
      submenu: [
        {
          label: 'Disconnect',
          click: () => this.sshManager.disconnect(conn.id),
        },
        {
          label: 'View Logs',
          click: () => {
            this.showWindow();
            // Notify renderer to select this tunnel
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('tray:select-tunnel', conn.id);
            }
          },
        },
      ],
    }));
  }

  /**
   * Toggle main window visibility
   */
  toggleWindow() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    if (this.mainWindow.isVisible()) {
      // macOS: Hide instead of minimize for cleaner UX
      if (this.isMac) {
        this.mainWindow.hide();
        app.hide();
      } else {
        this.mainWindow.hide();
      }
    } else {
      this.showWindow();
    }

    // Update menu after state change
    setTimeout(() => this.updateContextMenu(), 100);
  }

  /**
   * Show and focus main window
   */
  showWindow() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }

    this.mainWindow.show();
    this.mainWindow.focus();

    // macOS: Show dock icon when window is shown
    if (this.isMac) {
      app.dock.show();
    }

    // Update menu
    setTimeout(() => this.updateContextMenu(), 100);
  }

  /**
   * Setup window event handlers
   */
  setupWindowHandlers() {
    if (!this.mainWindow) return;

    // Handle window close button
    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting && this.minimizeToTray) {
        event.preventDefault();

        if (this.isMac) {
          // macOS: Hide window and remove from dock
          this.mainWindow.hide();
          app.hide();
        } else {
          // Windows/Linux: Hide to tray
          this.mainWindow.hide();
        }

        this.updateContextMenu();
        console.log('[Tray] Window minimized to tray');
      }
    });

    // macOS: Handle dock click (show window)
    if (this.isMac) {
      app.on('activate', () => {
        this.showWindow();
      });
    }

    // Update tray menu periodically to reflect connection status
    setInterval(() => {
      this.updateContextMenu();
    }, 5000);
  }

  /**
   * Connect all tunnels with auto_start enabled
   */
  async connectAll() {
    // This will be implemented with IPC call to renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('tray:connect-all');
    }
  }

  /**
   * Disconnect all tunnels
   */
  disconnectAll() {
    if (this.sshManager) {
      this.sshManager.disconnectAll();
    }
  }

  /**
   * Update mainWindow reference (e.g., after reload)
   */
  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
    this.setupWindowHandlers();
  }

  /**
   * Set SSH Manager reference
   */
  setSSHManager(sshManager) {
    this.sshManager = sshManager;
    this.updateContextMenu();
  }

  /**
   * Quit application properly
   */
  quitApp() {
    this.isQuitting = true;

    // Disconnect all tunnels first
    if (this.sshManager) {
      this.sshManager.disconnectAll();
    }

    // Destroy tray
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }

    // Quit app
    app.quit();
  }

  /**
   * Save settings (placeholder for future persistence)
   */
  saveSettings() {
    // TODO: Save minimizeToTray setting to database
    console.log('[Tray] Settings saved, minimizeToTray:', this.minimizeToTray);
  }

  /**
   * Load settings (placeholder for future persistence)
   */
  loadSettings() {
    // TODO: Load minimizeToTray setting from database
    return {
      minimizeToTray: true,
    };
  }

  /**
   * Destroy tray on cleanup
   */
  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = { TrayManager };
