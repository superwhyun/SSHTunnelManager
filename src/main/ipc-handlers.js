/**
 * IPC Handlers for main process
 * Registers all IPC handlers for renderer process communication
 */

const { ipcMain } = require('electron');
const crypto = require('./crypto');
const database = require('./database');
const { IPC_CHANNELS } = require('../shared/constants');

// SSH Manager instance (set during initialization)
let sshManager = null;

/**
 * Set SSH Manager instance for IPC handlers
 * @param {SSHManager} manager - SSH Manager instance
 */
function setSSHManager(manager) {
  sshManager = manager;
}

/**
 * Register all IPC handlers
 */
function registerIpcHandlers() {
  // Database: Create tunnel
  ipcMain.handle(IPC_CHANNELS.DB_TUNNEL_CREATE, async (event, tunnelData) => {
    try {
      const tunnel = database.createTunnel(tunnelData);
      return tunnel;
    } catch (error) {
      console.error('Error creating tunnel:', error);
      throw error;
    }
  });

  // Database: Get all tunnels
  ipcMain.handle(IPC_CHANNELS.DB_TUNNEL_GET_ALL, async (event, includeEncrypted = false) => {
    try {
      const tunnels = database.getAllTunnels(includeEncrypted);
      return tunnels;
    } catch (error) {
      console.error('Error getting tunnels:', error);
      throw error;
    }
  });

  // Database: Get tunnel by ID
  ipcMain.handle(IPC_CHANNELS.DB_TUNNEL_GET, async (event, id, includeEncrypted = false) => {
    try {
      const tunnel = database.getTunnel(id, includeEncrypted);
      if (!tunnel) {
        throw new Error('Tunnel not found');
      }
      return tunnel;
    } catch (error) {
      console.error('Error getting tunnel:', error);
      throw error;
    }
  });

  // Database: Update tunnel
  ipcMain.handle(IPC_CHANNELS.DB_TUNNEL_UPDATE, async (event, id, updates) => {
    try {
      const tunnel = database.updateTunnel(id, updates);
      return tunnel;
    } catch (error) {
      console.error('Error updating tunnel:', error);
      throw error;
    }
  });

  // Database: Delete tunnel
  ipcMain.handle(IPC_CHANNELS.DB_TUNNEL_DELETE, async (event, id) => {
    try {
      const deleted = database.deleteTunnel(id);
      if (!deleted) {
        throw new Error('Tunnel not found');
      }
      return { deleted: true };
    } catch (error) {
      console.error('Error deleting tunnel:', error);
      throw error;
    }
  });

  // Crypto: Set master key
  ipcMain.handle(IPC_CHANNELS.CRYPTO_SET_MASTER_KEY, async (event, key) => {
    try {
      crypto.setMasterKey(key);
      return { set: true };
    } catch (error) {
      console.error('Error setting master key:', error);
      throw error;
    }
  });

  // Crypto: Check if master key is set
  ipcMain.handle(IPC_CHANNELS.CRYPTO_HAS_MASTER_KEY, async () => {
    try {
      return crypto.hasMasterKey();
    } catch (error) {
      console.error('Error checking master key:', error);
      throw error;
    }
  });

  // SSH: Connect tunnel
  ipcMain.handle(IPC_CHANNELS.SSH_CONNECT, async (event, tunnelId) => {
    try {
      if (!sshManager) {
        throw new Error('SSH Manager not initialized');
      }
      // DB에서 tunnel 정보 조회 (비밀번호 포함)
      const tunnel = database.getTunnel(tunnelId, true);
      if (!tunnel) {
        throw new Error('Tunnel not found');
      }
      
      // DB snake_case → ssh-manager camelCase 변환
      console.log('[IPC] DB auth_type:', tunnel.auth_type);
      console.log('[IPC] DB private_key_path:', tunnel.private_key_path);
      
      const config = {
        host: tunnel.host,
        port: tunnel.port,
        username: tunnel.username,
        authType: tunnel.auth_type,
        password: tunnel.password,  // DB에서 이미 복호화됨
        privateKey: tunnel.private_key_path,
        passphrase: tunnel.key_passphrase,
        reconnect: tunnel.reconnect,
        tunnel: {
          localPort: tunnel.local_port,  // -L 옵션용 로컬 포트
          targetHost: tunnel.target_host,
          targetPort: tunnel.target_port,
        }
      };
      
      console.log('[IPC] Config privateKey:', config.privateKey);
      
      const result = sshManager.connect(tunnelId, config);
      // serializable한 데이터만 반환
      return { 
        success: true, 
        tunnel: {
          id: result.id,
          status: result.status,
          pid: result.pid
        }
      };
    } catch (error) {
      console.error('Error connecting SSH:', error);
      throw error;
    }
  });

  // SSH: Disconnect tunnel
  ipcMain.handle(IPC_CHANNELS.SSH_DISCONNECT, async (event, tunnelId) => {
    try {
      if (!sshManager) {
        throw new Error('SSH Manager not initialized');
      }
      const result = sshManager.disconnect(tunnelId);
      return { success: result };
    } catch (error) {
      console.error('Error disconnecting SSH:', error);
      throw error;
    }
  });

  // SSH: Get tunnel status
  ipcMain.handle(IPC_CHANNELS.SSH_STATUS, async (event, tunnelId) => {
    try {
      if (!sshManager) {
        return { status: 'unknown' };
      }
      const status = sshManager.getStatus(tunnelId);
      return { status };
    } catch (error) {
      console.error('Error getting SSH status:', error);
      throw error;
    }
  });

  // SSH: Get tunnel logs
  ipcMain.handle(IPC_CHANNELS.SSH_LOGS, async (event, tunnelId, limit = 100) => {
    try {
      if (!sshManager) {
        return { logs: [] };
      }
      const logs = sshManager.getLogs(tunnelId, limit);
      return { logs };
    } catch (error) {
      console.error('Error getting SSH logs:', error);
      throw error;
    }
  });

  // SSH: Get all active connections
  ipcMain.handle(IPC_CHANNELS.SSH_ACTIVE_CONNECTIONS, async () => {
    try {
      if (!sshManager) {
        return { connections: [] };
      }
      const connections = sshManager.getActiveConnections();
      return { connections };
    } catch (error) {
      console.error('Error getting active connections:', error);
      throw error;
    }
  });

  console.log('IPC handlers registered');
}

/**
 * Unregister all IPC handlers (for cleanup)
 */
function unregisterIpcHandlers() {
  Object.values(IPC_CHANNELS).forEach(channel => {
    ipcMain.removeHandler(channel);
  });
  console.log('IPC handlers unregistered');
}

module.exports = {
  registerIpcHandlers,
  unregisterIpcHandlers,
  setSSHManager,
};
