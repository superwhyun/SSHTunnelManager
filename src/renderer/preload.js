const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  createTunnel: (data) => ipcRenderer.invoke('db:tunnel:create', data),
  getAllTunnels: () => ipcRenderer.invoke('db:tunnel:getAll'),
  getTunnel: (id) => ipcRenderer.invoke('db:tunnel:get', id),
  updateTunnel: (id, data) => ipcRenderer.invoke('db:tunnel:update', id, data),
  deleteTunnel: (id) => ipcRenderer.invoke('db:tunnel:delete', id),
  
  // Crypto operations
  setMasterKey: (key) => ipcRenderer.invoke('crypto:setMasterKey', key),
  hasMasterKey: () => ipcRenderer.invoke('crypto:hasMasterKey'),
  
  // SSH Tunnel operations
  connectTunnel: (id) => ipcRenderer.invoke('ssh:connect', id),
  disconnectTunnel: (id) => ipcRenderer.invoke('ssh:disconnect', id),
  getTunnelStatus: (id) => ipcRenderer.invoke('ssh:status', id),
  getTunnelLogs: (id, limit) => ipcRenderer.invoke('ssh:logs', id, limit),
  getActiveConnections: () => ipcRenderer.invoke('ssh:activeConnections'),
  
  // Events from main
  onTunnelStatus: (callback) => {
    ipcRenderer.on('tunnel:status', (event, data) => callback(data));
  },
  onTunnelLog: (callback) => {
    ipcRenderer.on('tunnel:log', (event, data) => callback(data));
  }
});
