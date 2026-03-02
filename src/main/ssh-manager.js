/**
 * SSH Connection Manager
 * Handles SSH tunnel creation, monitoring, and lifecycle
 * Uses port connection test for status detection (not log parsing)
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const net = require('net');
const path = require('path');

// Connection status constants
const ConnectionStatus = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
  AUTH_FAILED: 'auth_failed',
  CONNECTION_REFUSED: 'connection_refused',
  RECONNECTING: 'reconnecting',
};

/**
 * SSH Manager class
 * Manages SSH tunnel connections
 */
class SSHManager extends EventEmitter {
  constructor(mainWindow) {
    super();
    this.tunnels = new Map();
    this.sshPath = process.platform === 'win32'
      ? 'C:\\Windows\\System32\\OpenSSH\\ssh.exe'
      : 'ssh';
    this.mainWindowRef = mainWindow;
    this.MAX_RECONNECT_ATTEMPTS = 5;
    this.RECONNECT_DELAY = 3000; // Fixed 3 seconds reconnnect
    this.KILL_TIMEOUT = 5000;
  }

  setMainWindow(mainWindow) {
    this.mainWindowRef = mainWindow;
  }

  /**
   * Connect to SSH tunnel
   */
  connect(tunnelId, config) {
    if (this.tunnels.has(tunnelId)) {
      const existing = this.tunnels.get(tunnelId);
      if (existing.status === ConnectionStatus.CONNECTED) {
        throw new Error('Tunnel is already connected');
      }
      this._cleanupTunnel(tunnelId);
    }

    const { host, port = 22, username, privateKey, authType, tunnel, reconnect = true } = config;

    if (!host || !username || !tunnel) {
      throw new Error('Missing required configuration: host, username, or tunnel');
    }

    const args = this._buildSSHArgs({ host, port, username, privateKey, authType, tunnel });

    console.log(`[SSH] Executing: ${this.sshPath} ${args.join(' ')}`);

    const sshProcess = spawn(this.sshPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    const tunnelInfo = {
      id: tunnelId,
      config: { ...config, password: undefined },
      process: sshProcess,
      pid: sshProcess.pid,
      status: ConnectionStatus.CONNECTING,
      logs: [],
      startTime: Date.now(),
      reconnectAttempts: 0,
      manualStop: false,
      localPort: tunnel.localPort,
    };

    this.tunnels.set(tunnelId, tunnelInfo);
    this._setupProcessHandlers(tunnelId, sshProcess);

    // Check if process exited immediately
    setTimeout(() => {
      const tunnel = this.tunnels.get(tunnelId);
      if (tunnel && tunnel.process && !tunnel.process.killed && tunnel.status === ConnectionStatus.CONNECTING) {
        // If it survived for 1.5 seconds, consider it connected
        this._setStatus(tunnelId, ConnectionStatus.CONNECTED);
      } else if (tunnel && tunnel.process && tunnel.process.killed) {
        console.log(`[SSH:${tunnelId}] Process died immediately after spawn`);
      }
    }, 1500);

    this._setStatus(tunnelId, ConnectionStatus.CONNECTING);
    return tunnelInfo;
  }

  /**
   * Set status and notify renderer
   */
  _setStatus(tunnelId, status) {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) return;

    // Only update if status actually changed
    if (tunnel.status === status) return;

    tunnel.status = status;
    this.emit('statusChanged', tunnelId, status);
    this._notifyRenderer('tunnel:status', { id: tunnelId, status });

    // Add log for important status changes
    if (status === ConnectionStatus.CONNECTED) {
      this._addLog(tunnelId, { time: Date.now(), data: 'Tunnel connected successfully' });
      this._notifyRenderer('tunnel:log', { id: tunnelId, message: 'Tunnel connected successfully', type: 'success' });
    } else if (status === ConnectionStatus.ERROR) {
      this._addLog(tunnelId, { time: Date.now(), data: 'Connection error' });
      this._notifyRenderer('tunnel:log', { id: tunnelId, message: 'Connection error', type: 'error' });
    }
  }

  disconnect(tunnelId) {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel || !tunnel.process) {
      return false;
    }

    tunnel.manualStop = true;

    // Clear heartbeat
    if (tunnel.heartbeatTimer) {
      clearTimeout(tunnel.heartbeatTimer);
      tunnel.heartbeatTimer = null;
    }

    if (!tunnel.process.killed) {
      tunnel.process.kill('SIGTERM');
      setTimeout(() => {
        if (tunnel.process && !tunnel.process.killed) {
          this._forceKill(tunnel.process, tunnel.pid);
        }
      }, this.KILL_TIMEOUT);
    }

    return true;
  }

  disconnectAll() {
    for (const [id, tunnel] of this.tunnels) {
      if (tunnel.process && !tunnel.process.killed) {
        this.disconnect(id);
      }
    }
  }

  getStatus(tunnelId) {
    const tunnel = this.tunnels.get(tunnelId);
    return tunnel?.status || ConnectionStatus.DISCONNECTED;
  }

  getLogs(tunnelId, limit = 100) {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) return [];
    return tunnel.logs.slice(-limit);
  }

  getActiveConnections() {
    const connections = [];
    for (const [id, tunnel] of this.tunnels) {
      if (tunnel.status === ConnectionStatus.CONNECTED ||
        tunnel.status === ConnectionStatus.CONNECTING) {
        connections.push({
          id,
          status: tunnel.status,
          pid: tunnel.pid,
          startTime: tunnel.startTime,
        });
      }
    }
    return connections;
  }

  _cleanupTunnel(tunnelId) {
    const tunnel = this.tunnels.get(tunnelId);
    if (tunnel) {
      if (tunnel.heartbeatTimer) {
        clearTimeout(tunnel.heartbeatTimer);
      }
      if (tunnel.process && !tunnel.process.killed) {
        tunnel.process.kill('SIGKILL');
      }
    }
    this.tunnels.delete(tunnelId);
  }

  _forceKill(process, pid) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', pid, '/f', '/t']);
      } else {
        process.kill(-pid, 'SIGKILL');
      }
    } catch (error) {
      console.error('Force kill failed:', error);
    }
  }

  _buildSSHArgs({ host, port, username, privateKey, authType, tunnel }) {
    const args = ['-N'];
    const localPort = tunnel.localPort;

    // Bind to specific interface to avoid IPv6/IPv4 mismatch
    // Format: [bind_address:]localPort:targetHost:targetPort
    const bindAddr = '127.0.0.1';
    args.push('-L', `${bindAddr}:${localPort}:${tunnel.targetHost}:${tunnel.targetPort}`);

    // Force IPv4 to avoid IPv6/IPv4 confusion
    args.push('-4');

    args.push('-p', port.toString());

    if (authType === 'key' && privateKey) {
      args.push('-i', privateKey);
    }

    args.push('-o', 'ServerAliveInterval=30');
    args.push('-o', 'ServerAliveCountMax=3');
    args.push('-o', 'ExitOnForwardFailure=yes');
    args.push('-o', 'StrictHostKeyChecking=no');
    args.push('-o', 'UserKnownHostsFile=/dev/null');
    args.push(`${username}@${host}`);

    return args;
  }

  _setupProcessHandlers(tunnelId, sshProcess) {
    sshProcess.stdout.on('data', (data) => {
      const logData = data.toString();
      this._addLog(tunnelId, { time: Date.now(), data: logData });
      this._notifyRenderer('tunnel:log', { id: tunnelId, message: logData, type: 'info' });
    });

    sshProcess.stderr.on('data', (data) => {
      const logData = data.toString();

      // Store ALL logs
      this._addLog(tunnelId, { time: Date.now(), data: logData, isError: true });

      // Just pass error output to UI simply
      this._notifyRenderer('tunnel:log', { id: tunnelId, message: logData, type: 'info' });
    });

    sshProcess.on('exit', (code, signal) => {
      this._handleProcessExit(tunnelId, code, signal);
    });

    sshProcess.on('error', (error) => {
      this._handleProcessError(tunnelId, error);
    });
  }

  _addLog(tunnelId, logEntry) {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) return;
    tunnel.logs.push(logEntry);
    if (tunnel.logs.length > 1000) {
      tunnel.logs = tunnel.logs.slice(-1000);
    }
  }

  _handleProcessExit(tunnelId, code, signal) {
    const tunnel = this.tunnels.get(tunnelId);

    // Get last few lines of stderr for debugging
    const recentLogs = tunnel?.logs?.slice(-5).map(l => l.data).join('') || 'no logs';
    console.log(`[SSH:${tunnelId}] Process exited with code ${code}, signal ${signal}`);
    console.log(`[SSH:${tunnelId}] Recent logs:\n${recentLogs}`);

    if (!tunnel) return;

    // Clear heartbeat
    if (tunnel.heartbeatTimer) {
      clearTimeout(tunnel.heartbeatTimer);
      tunnel.heartbeatTimer = null;
    }

    if (tunnel.manualStop) {
      this._setStatus(tunnelId, ConnectionStatus.DISCONNECTED);
    } else if (code !== 0) {
      this._setStatus(tunnelId, ConnectionStatus.ERROR);
    } else {
      this._setStatus(tunnelId, ConnectionStatus.DISCONNECTED);
    }

    // Auto-reconnect
    if (!tunnel.manualStop &&
      tunnel.config.reconnect &&
      tunnel.status !== ConnectionStatus.AUTH_FAILED &&
      tunnel.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      this._scheduleReconnect(tunnelId);
    }
  }

  _handleProcessError(tunnelId, error) {
    console.log(`[SSH:${tunnelId}] Process error:`, error.message);
    this._setStatus(tunnelId, ConnectionStatus.ERROR);
    this._notifyRenderer('tunnel:log', {
      id: tunnelId,
      message: `Process error: ${error.message}`,
      type: 'error'
    });
  }

  _scheduleReconnect(tunnelId) {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) return;

    tunnel.reconnectAttempts++;
    const delay = this.RECONNECT_DELAY;

    this._setStatus(tunnelId, ConnectionStatus.RECONNECTING);
    this._notifyRenderer('tunnel:status', {
      id: tunnelId,
      status: ConnectionStatus.RECONNECTING,
      attempt: tunnel.reconnectAttempts,
      delay,
    });

    setTimeout(() => {
      if (!tunnel.manualStop) {
        this.connect(tunnelId, tunnel.config);
      }
    }, delay);
  }

  _notifyRenderer(channel, data) {
    if (this.mainWindowRef && !this.mainWindowRef.isDestroyed()) {
      this.mainWindowRef.webContents.send(channel, data);
    }
  }
}

module.exports = {
  SSHManager,
  ConnectionStatus,
};
