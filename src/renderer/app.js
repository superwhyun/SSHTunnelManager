/**
 * Main Application Entry Point
 */

class App {
  constructor() {
    this.tunnels = [];
    this.selectedTunnelId = null;
    this.isEditing = false;
    this.tunnelStatuses = new Map(); // tunnelId -> status
    this.tunnelLogs = new Map(); // tunnelId -> logs array
  }

  async init() {
    console.log('[App] Initializing...');

    // Check master key
    const hasKey = await window.electronAPI.hasMasterKey();
    if (!hasKey) {
      this.showMasterKeyModal();
    } else {
      this.hideMasterKeyModal();
      await this.loadTunnels();

      // Sync with existing SSH connections from main process
      await this.syncWithMainProcess();
    }

    this.setupEventListeners();
    console.log('[App] Initialized');
  }

  // Sync tunnel statuses with main process (for reload recovery)
  async syncWithMainProcess() {
    try {
      console.log('[App] Syncing with main process...');
      const result = await window.electronAPI.getActiveConnections();
      const connections = result.connections || [];
      console.log('[App] Active connections from main:', connections);

      for (const conn of connections) {
        this.tunnelStatuses.set(conn.id, conn.status);

        // Update tunnel in list
        const tunnel = this.tunnels.find(t => t.id === conn.id);
        if (tunnel) {
          tunnel.status = conn.status;
        }

        // Fetch existing logs for this connection
        try {
          const tunnelLogsResponse = await window.electronAPI.getTunnelLogs(conn.id, 100);
          if (tunnelLogsResponse && tunnelLogsResponse.logs) {
            this.tunnelLogs.set(conn.id, tunnelLogsResponse.logs.map(log => ({
              time: new Date(log.time),
              message: log.data,
              type: log.isError ? 'error' : 'info' // ssh-manager now stores isError boolean
            })));
          }
        } catch (err) {
          console.error(`[App] Failed to fetch logs for tunnel ${conn.id}`, err);
        }
      }

      this.renderTunnelList();
    } catch (error) {
      console.error('[App] Failed to sync with main process:', error);
    }
  }

  // Master Key Modal
  showMasterKeyModal() {
    document.getElementById('masterKeyModal').classList.remove('hidden');
  }

  hideMasterKeyModal() {
    document.getElementById('masterKeyModal').classList.add('hidden');
  }

  async setupMasterKey() {
    const key = document.getElementById('masterKeyInput').value;
    const confirm = document.getElementById('confirmKeyInput').value;
    const errorDiv = document.getElementById('setupError');
    const successDiv = document.getElementById('setupSuccess');

    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    if (!key || key.length < 8) {
      errorDiv.textContent = 'Master key must be at least 8 characters';
      errorDiv.classList.remove('hidden');
      return;
    }

    if (key !== confirm) {
      errorDiv.textContent = 'Passwords do not match';
      errorDiv.classList.remove('hidden');
      return;
    }

    try {
      await window.electronAPI.setMasterKey(key);
      successDiv.textContent = 'Secure storage initialized successfully!';
      successDiv.classList.remove('hidden');

      setTimeout(() => {
        this.hideMasterKeyModal();
        this.loadTunnels();
      }, 1000);
    } catch (error) {
      errorDiv.textContent = 'Failed to initialize: ' + error.message;
      errorDiv.classList.remove('hidden');
    }
  }

  // Load tunnels
  async loadTunnels() {
    try {
      this.tunnels = await window.electronAPI.getAllTunnels();
      this.renderTunnelList();
    } catch (error) {
      console.error('Failed to load tunnels:', error);
    }
  }

  renderTunnelList() {
    const list = document.getElementById('tunnelList');

    if (this.tunnels.length === 0) {
      list.innerHTML = '<div class="text-center text-gray-500 py-8 text-sm">No tunnels configured</div>';
      return;
    }

    list.innerHTML = this.tunnels.map(t => {
      const status = this.tunnelStatuses.get(t.id) || t.status || 'disconnected';
      return `
        <div 
          class="tunnel-item p-3 rounded-lg cursor-pointer transition flex items-center justify-between ${this.selectedTunnelId === t.id ? 'bg-gray-800 border border-gray-700' : 'hover:bg-gray-800/50'}"
          data-id="${t.id}"
        >
          <div class="min-w-0">
            <div class="font-medium text-sm truncate">${t.name}</div>
            <div class="text-xs text-gray-500 truncate">${t.host}:${t.local_port} → ${t.target_port}</div>
          </div>
          <span class="status-dot w-2 h-2 rounded-full ${this.getStatusColor(status)}"></span>
        </div>
      `;
    }).join('');

    // Add click handlers
    list.querySelectorAll('.tunnel-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectTunnel(item.dataset.id);
      });
    });
  }

  getStatusColor(status) {
    switch (status) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  }

  // Select tunnel
  async selectTunnel(id) {
    this.selectedTunnelId = id;
    this.renderTunnelList();

    const tunnel = this.tunnels.find(t => t.id === id);
    if (tunnel) {
      this.showDetailView(tunnel);
    }
  }

  // View management
  showEmptyState() {
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('detailView').classList.add('hidden');
    document.getElementById('formView').classList.add('hidden');
  }

  showDetailView(tunnel) {
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('detailView').classList.remove('hidden');
    document.getElementById('formView').classList.add('hidden');

    // Fill details
    document.getElementById('detailName').textContent = tunnel.name;
    document.getElementById('detailHost').textContent = `${tunnel.username}@${tunnel.host}:${tunnel.port}`;

    // Get current status from status map or default to disconnected
    const status = this.tunnelStatuses.get(tunnel.id) || tunnel.status || 'disconnected';
    const color = this.getStatusColor(status);

    const statusEl = document.getElementById('detailStatus');
    statusEl.innerHTML = `
      <span class="w-2 h-2 rounded-full ${color}"></span>
      <span class="${status === 'connected' ? 'text-green-400' : status === 'error' ? 'text-red-400' : 'text-gray-400'}">
        ${status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    `;

    // Update connect button based on status
    this.updateConnectButton(status);

    // Config
    document.getElementById('cfgHost').textContent = tunnel.host;
    document.getElementById('cfgPort').textContent = tunnel.port;
    document.getElementById('cfgUsername').textContent = tunnel.username;
    document.getElementById('cfgAuth').textContent = tunnel.auth_type === 'password' ? 'Password' : 'SSH Key';
    document.getElementById('cfgLocalPort').textContent = tunnel.local_port;
    document.getElementById('cfgTarget').textContent = `${tunnel.target_host}:${tunnel.target_port}`;

    // Load existing logs for this tunnel
    this.loadTunnelLogs(tunnel.id);
  }

  // Load logs for selected tunnel
  loadTunnelLogs(id) {
    const container = document.getElementById('logContainer');
    const logs = this.tunnelLogs.get(id) || [];

    if (logs.length === 0) {
      container.innerHTML = '<div class="text-gray-500 italic">No logs available...</div>';
      return;
    }

    container.innerHTML = '';
    logs.forEach(log => {
      const time = log.time.toLocaleTimeString();
      const color = log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : 'text-gray-400';
      const div = document.createElement('div');
      div.className = color;
      div.innerHTML = `<span class="text-gray-600">[${time}]</span> ${log.message}`;
      container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
  }

  showFormView(editMode = false) {
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('detailView').classList.add('hidden');
    document.getElementById('formView').classList.remove('hidden');

    document.getElementById('formTitle').textContent = editMode ? 'Edit Tunnel' : 'New Tunnel';

    if (!editMode) {
      document.getElementById('tunnelForm').reset();
      document.getElementById('formSshPort').value = '22';
      document.getElementById('formTargetHost').value = 'localhost';
    }
  }

  // Event listeners
  setupEventListeners() {
    // Master key setup
    document.getElementById('setupBtn').addEventListener('click', () => this.setupMasterKey());
    document.getElementById('confirmKeyInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.setupMasterKey();
    });

    // Add tunnel
    document.getElementById('btnAddTunnel').addEventListener('click', () => {
      this.isEditing = false;
      this.showFormView(false);
    });

    // Auth type toggle
    document.querySelectorAll('input[name="authType"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const isPassword = e.target.value === 'password';
        document.getElementById('passwordField').classList.toggle('hidden', !isPassword);
        document.getElementById('keyField').classList.toggle('hidden', isPassword);
      });
    });

    // Form submit
    document.getElementById('tunnelForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveTunnel();
    });

    // Cancel
    document.getElementById('btnCancel').addEventListener('click', () => {
      if (this.selectedTunnelId) {
        const tunnel = this.tunnels.find(t => t.id === this.selectedTunnelId);
        this.showDetailView(tunnel);
      } else {
        this.showEmptyState();
      }
    });

    // Edit
    document.getElementById('btnEdit').addEventListener('click', () => {
      if (this.selectedTunnelId) {
        this.isEditing = true;
        this.loadTunnelForEdit(this.selectedTunnelId);
      }
    });

    // Delete
    document.getElementById('btnDelete').addEventListener('click', async () => {
      if (this.selectedTunnelId && confirm('Delete this tunnel?')) {
        // Disconnect if connected
        const status = this.tunnelStatuses.get(this.selectedTunnelId);
        if (status === 'connected' || status === 'connecting') {
          await this.onTunnelDisconnect(this.selectedTunnelId);
        }
        await window.electronAPI.deleteTunnel(this.selectedTunnelId);
        this.selectedTunnelId = null;
        await this.loadTunnels();
        this.showEmptyState();
      }
    });

    // Connect/Disconnect
    document.getElementById('btnConnect').addEventListener('click', () => {
      if (!this.selectedTunnelId) return;

      const status = this.tunnelStatuses.get(this.selectedTunnelId);
      if (status === 'connected') {
        this.onTunnelDisconnect(this.selectedTunnelId);
      } else if (status === 'connecting') {
        // Already connecting, do nothing or cancel
        return;
      } else {
        this.onTunnelConnect(this.selectedTunnelId);
      }
    });

    // Clear logs
    document.getElementById('btnClearLogs').addEventListener('click', () => {
      document.getElementById('logContainer').innerHTML = '<div class="text-gray-500 italic">No logs available...</div>';
    });

    // Real-time tunnel status updates from main
    window.electronAPI.onTunnelStatus((data) => {
      this.handleTunnelStatusUpdate(data);
    });

    // Track which tunnels were connected before sleep
    this.preSleepStatuses = new Map();

    // Handle sleep/wake - reconnect if needed
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'hidden') {
        // Going to sleep - remember current connection states
        console.log('[App] Sleep detected, saving connection states...');
        this.preSleepStatuses = new Map(this.tunnelStatuses);
      } else if (document.visibilityState === 'visible') {
        // Wake up - reconnect only if was connected before sleep
        console.log('[App] Wake detected, checking connections...');
        for (const tunnel of this.tunnels) {
          const currentStatus = this.tunnelStatuses.get(tunnel.id);
          const wasConnected = this.preSleepStatuses.get(tunnel.id) === 'connected';

          // Only reconnect if: was connected before sleep AND now disconnected
          if (wasConnected && currentStatus === 'disconnected') {
            console.log(`[App] Reconnecting ${tunnel.id} (was connected before sleep)`);
            await this.onTunnelConnect(tunnel.id);
          }
        }
        // Clear saved states
        this.preSleepStatuses.clear();
      }
    });

    // Real-time log messages from main
    window.electronAPI.onTunnelLog((data) => {
      if (data.id === this.selectedTunnelId) {
        this.addLog(data.message, data.type);
      }
      // Store log for this tunnel
      if (!this.tunnelLogs.has(data.id)) {
        this.tunnelLogs.set(data.id, []);
      }
      this.tunnelLogs.get(data.id).push({
        time: new Date(),
        message: data.message,
        type: data.type
      });
    });
  }

  // Handle tunnel status updates from main process
  handleTunnelStatusUpdate(data) {
    console.log('[App] Status update received:', data);
    const { id, status, error } = data;

    // Update status map
    this.tunnelStatuses.set(id, status);

    // Update tunnel in list
    const tunnel = this.tunnels.find(t => t.id === id);
    if (tunnel) {
      tunnel.status = status;
    }

    // Re-render list to show status change
    this.renderTunnelList();

    // Update detail view if this tunnel is selected
    if (this.selectedTunnelId === id) {
      const statusEl = document.getElementById('detailStatus');
      const color = this.getStatusColor(status);
      statusEl.innerHTML = `
        <span class="w-2 h-2 rounded-full ${color}"></span>
        <span class="${status === 'connected' ? 'text-green-400' : status === 'error' ? 'text-red-400' : 'text-gray-400'}">
          ${status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      `;

      // Update connect button
      this.updateConnectButton(status);

      // Status change is already logged by ssh-manager.js
    }
  }

  // Update connect button based on status
  updateConnectButton(status) {
    const btn = document.getElementById('btnConnect');
    const statusText = status === 'connected' ? 'Disconnect' :
      status === 'connecting' ? 'Connecting...' :
        status === 'error' ? 'Retry' : 'Connect';

    // Update button color
    btn.className = this.getConnectButtonClass(status);

    // Update button text and icon
    const icon = status === 'connected' ?
      `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
      </svg>` :
      `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
      </svg>`;

    btn.innerHTML = `${icon} ${statusText}`;
  }

  // Get button class based on status
  getConnectButtonClass(status) {
    const baseClass = 'px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ';
    switch (status) {
      case 'connected':
        return baseClass + 'bg-red-600 hover:bg-red-500 text-white';
      case 'connecting':
        return baseClass + 'bg-yellow-600 hover:bg-yellow-500 text-white cursor-wait';
      case 'error':
        return baseClass + 'bg-orange-600 hover:bg-orange-500 text-white';
      default: // disconnected
        return baseClass + 'bg-green-600 hover:bg-green-500 text-white';
    }
  }

  // Connect to tunnel
  async onTunnelConnect(id) {
    try {
      this.addLog('Initiating SSH connection...', 'info');
      this.tunnelStatuses.set(id, 'connecting');
      this.renderTunnelList();

      if (this.selectedTunnelId === id) {
        this.updateConnectButton('connecting');
      }

      const result = await window.electronAPI.connectTunnel(id);

      if (result.success) {
        this.addLog('SSH connection established', 'success');
      } else {
        this.addLog(`Connection failed: ${result.error || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      console.error('Failed to connect tunnel:', error);
      this.addLog(`Connection error: ${error.message}`, 'error');
      this.tunnelStatuses.set(id, 'error');
      this.renderTunnelList();
      if (this.selectedTunnelId === id) {
        this.updateConnectButton('error');
      }
    }
  }

  // Disconnect from tunnel
  async onTunnelDisconnect(id) {
    try {
      this.addLog('Disconnecting...', 'info');

      const result = await window.electronAPI.disconnectTunnel(id);

      if (result.success) {
        this.addLog('Disconnected successfully', 'success');
      } else {
        this.addLog(`Disconnect error: ${result.error || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      console.error('Failed to disconnect tunnel:', error);
      this.addLog(`Disconnect error: ${error.message}`, 'error');
    }
  }

  async loadTunnelForEdit(id) {
    try {
      const tunnel = await window.electronAPI.getTunnel(id);
      if (!tunnel) return;

      document.getElementById('formName').value = tunnel.name;
      document.getElementById('formHost').value = tunnel.host;
      document.getElementById('formSshPort').value = tunnel.port;
      document.getElementById('formUsername').value = tunnel.username;
      document.getElementById('formLocalPort').value = tunnel.local_port;
      document.getElementById('formTargetHost').value = tunnel.target_host;
      document.getElementById('formTargetPort').value = tunnel.target_port;
      document.getElementById('formAutoStart').checked = tunnel.auto_start;

      // Auth
      const authType = tunnel.auth_type || 'password';
      document.querySelector(`input[name="authType"][value="${authType}"]`).checked = true;
      document.getElementById('passwordField').classList.toggle('hidden', authType !== 'password');
      document.getElementById('keyField').classList.toggle('hidden', authType === 'password');

      if (authType === 'password') {
        document.getElementById('formPassword').value = ''; // Don't show encrypted
      } else {
        document.getElementById('formKeyPath').value = tunnel.private_key_path || '';
      }

      this.showFormView(true);
    } catch (error) {
      console.error('Failed to load tunnel:', error);
    }
  }

  async saveTunnel() {
    const authType = document.querySelector('input[name="authType"]:checked').value;

    const data = {
      name: document.getElementById('formName').value,
      host: document.getElementById('formHost').value,
      port: parseInt(document.getElementById('formSshPort').value),
      username: document.getElementById('formUsername').value,
      auth_type: authType,
      local_port: parseInt(document.getElementById('formLocalPort').value),
      target_host: document.getElementById('formTargetHost').value,
      target_port: parseInt(document.getElementById('formTargetPort').value),
      auto_start: document.getElementById('formAutoStart').checked
    };

    if (authType === 'password') {
      data.password = document.getElementById('formPassword').value;
    } else {
      data.private_key_path = document.getElementById('formKeyPath').value;
      data.key_passphrase = document.getElementById('formKeyPassphrase').value || null;
    }

    try {
      if (this.isEditing && this.selectedTunnelId) {
        await window.electronAPI.updateTunnel(this.selectedTunnelId, data);
      } else {
        await window.electronAPI.createTunnel(data);
      }

      await this.loadTunnels();
      this.showEmptyState();
    } catch (error) {
      alert('Failed to save tunnel: ' + error.message);
    }
  }

  addLog(message, type = 'info') {
    const container = document.getElementById('logContainer');
    const time = new Date().toLocaleTimeString();
    const color = type === 'error' ? 'text-red-400' : type === 'success' ? 'text-green-400' : 'text-gray-400';

    if (container.children.length === 1 && container.children[0].classList.contains('italic')) {
      container.innerHTML = '';
    }

    const div = document.createElement('div');
    div.className = `${color}`;
    div.innerHTML = `<span class="text-gray-600">[${time}]</span> ${message}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }
}

// Start
document.addEventListener('DOMContentLoaded', () => {
  new App().init();
});
