/**
 * DetailPanel Component
 * Displays detailed information about a selected tunnel
 */
class DetailPanel {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.tunnel = null;
    this.logs = [];
    this.onConnectCallback = null;
    this.onDisconnectCallback = null;
    this.onEditCallback = null;
    this.onDeleteCallback = null;
    this.onBackCallback = null;
  }

  // Set callbacks
  onConnect(callback) {
    this.onConnectCallback = callback;
  }

  onDisconnect(callback) {
    this.onDisconnectCallback = callback;
  }

  onEdit(callback) {
    this.onEditCallback = callback;
  }

  onDelete(callback) {
    this.onDeleteCallback = callback;
  }

  onBack(callback) {
    this.onBackCallback = callback;
  }

  // Load tunnel details
  async loadTunnel(tunnelId) {
    try {
      this.tunnel = await window.electronAPI.getTunnel(tunnelId);
      this.render();
      this.initEventListeners();
    } catch (error) {
      console.error('[DetailPanel] Failed to load tunnel:', error);
      this.container.innerHTML = `
        <div class="flex-1 flex items-center justify-center text-red-400">
          <div class="text-center">
            <div class="text-4xl mb-2">⚠️</div>
            <p>Failed to load tunnel details</p>
            <p class="text-sm text-gray-500">${error.message}</p>
          </div>
        </div>
      `;
    }
  }

  // Update status
  updateStatus(status) {
    if (this.tunnel) {
      this.tunnel.status = status;
      const statusBadge = document.getElementById('detail-status-badge');
      const connectBtn = document.getElementById('btn-connect');
      const disconnectBtn = document.getElementById('btn-disconnect');

      if (statusBadge) {
        statusBadge.className = this.getStatusBadgeClass(status);
        statusBadge.textContent = this.getStatusText(status);
      }

      if (connectBtn && disconnectBtn) {
        if (status === 'connected') {
          connectBtn.classList.add('hidden');
          disconnectBtn.classList.remove('hidden');
        } else {
          connectBtn.classList.remove('hidden');
          disconnectBtn.classList.add('hidden');
        }
      }
    }
  }

  // Add log entry
  addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    this.logs.push(logEntry);

    const logTextarea = document.getElementById('tunnel-logs');
    if (logTextarea) {
      logTextarea.value += logEntry + '\n';
      logTextarea.scrollTop = logTextarea.scrollHeight;
    }
  }

  // Get status badge class
  getStatusBadgeClass(status) {
    const base = 'px-3 py-1 rounded-full text-xs font-semibold';
    switch (status) {
      case 'connected':
        return `${base} bg-green-900 text-green-300 border border-green-700`;
      case 'connecting':
        return `${base} bg-yellow-900 text-yellow-300 border border-yellow-700`;
      case 'disconnected':
      default:
        return `${base} bg-red-900 text-red-300 border border-red-700`;
    }
  }

  // Get status text
  getStatusText(status) {
    switch (status) {
      case 'connected': return '● Connected';
      case 'connecting': return '● Connecting...';
      case 'disconnected':
      default: return '● Disconnected';
    }
  }

  // Get auth type display text
  getAuthTypeText(authType) {
    switch (authType) {
      case 'password': return 'Password';
      case 'key': return 'Private Key';
      default: return authType;
    }
  }

  // Render detail panel
  render() {
    const t = this.tunnel;
    const status = t.status || 'disconnected';

    this.container.innerHTML = `
      <!-- Header -->
      <div class="border-b border-gray-700 p-6 bg-gray-800">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-4">
            <button id="btn-back" class="md:hidden text-gray-400 hover:text-white">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
              </svg>
            </button>
            <div>
              <h2 class="text-2xl font-bold text-white">${this.escapeHtml(t.name)}</h2>
              <div class="flex items-center gap-3 mt-2">
                <span id="detail-status-badge" class="${this.getStatusBadgeClass(status)}">
                  ${this.getStatusText(status)}
                </span>
                <span class="text-sm text-gray-400">ID: ${t.id}</span>
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            <button id="btn-edit" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors">
              ✏️ Edit
            </button>
            <button id="btn-delete" class="px-4 py-2 bg-red-900 hover:bg-red-800 text-red-100 rounded-lg text-sm font-medium transition-colors">
              🗑️ Delete
            </button>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6">
        <!-- Connection Controls -->
        <div class="flex gap-3 mb-6">
          <button id="btn-connect" class="${status === 'connected' ? 'hidden' : ''} flex-1 btn-success px-6 py-3 rounded-lg font-medium text-white flex items-center justify-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
            Connect
          </button>
          <button id="btn-disconnect" class="${status !== 'connected' ? 'hidden' : ''} flex-1 bg-red-600 hover:bg-red-500 px-6 py-3 rounded-lg font-medium text-white flex items-center justify-center gap-2 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
            Disconnect
          </button>
        </div>

        <!-- Configuration -->
        <div class="border border-gray-700 rounded-lg p-5 bg-gray-800 mb-6">
          <h3 class="text-sm font-semibold text-blue-400 mb-4 uppercase tracking-wide flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
            Configuration
          </h3>
          
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div class="bg-gray-900 rounded p-3">
              <span class="text-gray-500 block text-xs mb-1">SSH Server</span>
              <span class="text-white font-mono">${this.escapeHtml(t.host)}:${t.ssh_port}</span>
            </div>
            <div class="bg-gray-900 rounded p-3">
              <span class="text-gray-500 block text-xs mb-1">Username</span>
              <span class="text-white font-mono">${this.escapeHtml(t.username)}</span>
            </div>
            <div class="bg-gray-900 rounded p-3">
              <span class="text-gray-500 block text-xs mb-1">Authentication</span>
              <span class="text-white">${this.getAuthTypeText(t.auth_type)}</span>
              ${t.private_key_path ? `<div class="text-xs text-gray-500 mt-1 truncate">${this.escapeHtml(t.private_key_path)}</div>` : ''}
            </div>
            <div class="bg-gray-900 rounded p-3">
              <span class="text-gray-500 block text-xs mb-1">Auto Start</span>
              <span class="${t.auto_start ? 'text-green-400' : 'text-gray-500'}">
                ${t.auto_start ? '✓ Enabled' : '✗ Disabled'}
              </span>
            </div>
          </div>
        </div>

        <!-- Tunnel Mapping -->
        <div class="border border-gray-700 rounded-lg p-5 bg-gray-800 mb-6">
          <h3 class="text-sm font-semibold text-blue-400 mb-4 uppercase tracking-wide flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
            </svg>
            Port Mapping
          </h3>
          
          <div class="flex items-center justify-center gap-4 text-sm">
            <div class="text-center">
              <div class="bg-gray-900 rounded p-3 min-w-[120px]">
                <div class="text-gray-500 text-xs mb-1">Local Port</div>
                <div class="text-xl font-bold text-blue-400">${t.local_port}</div>
              </div>
            </div>
            <div class="text-gray-500">
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
              </svg>
            </div>
            <div class="text-center">
              <div class="bg-gray-900 rounded p-3 min-w-[120px]">
                <div class="text-gray-500 text-xs mb-1">Remote Target</div>
                <div class="text-xl font-bold text-green-400">${this.escapeHtml(t.target_host)}:${t.target_port}</div>
              </div>
            </div>
          </div>
          
          <div class="text-center mt-3 text-xs text-gray-500">
            localhost:${t.local_port} → ${this.escapeHtml(t.host)} → ${this.escapeHtml(t.target_host)}:${t.target_port}
          </div>
        </div>

        <!-- Logs -->
        <div class="border border-gray-700 rounded-lg p-5 bg-gray-800">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-blue-400 uppercase tracking-wide flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              Connection Logs
            </h3>
            <button id="btn-clear-logs" class="text-xs text-gray-500 hover:text-white transition-colors">
              Clear
            </button>
          </div>
          <textarea id="tunnel-logs" readonly
            class="log-textarea w-full h-48 bg-gray-950 text-gray-300 rounded-lg p-3 border border-gray-700 resize-none focus:outline-none"
            placeholder="Connection logs will appear here...">${this.logs.join('\n')}</textarea>
        </div>
      </div>
    `;
  }

  // Initialize event listeners
  initEventListeners() {
    // Back button (mobile)
    const backBtn = document.getElementById('btn-back');
    if (backBtn && this.onBackCallback) {
      backBtn.addEventListener('click', () => this.onBackCallback());
    }

    // Connect button
    const connectBtn = document.getElementById('btn-connect');
    if (connectBtn && this.onConnectCallback) {
      connectBtn.addEventListener('click', () => this.onConnectCallback(this.tunnel.id));
    }

    // Disconnect button
    const disconnectBtn = document.getElementById('btn-disconnect');
    if (disconnectBtn && this.onDisconnectCallback) {
      disconnectBtn.addEventListener('click', () => this.onDisconnectCallback(this.tunnel.id));
    }

    // Edit button
    const editBtn = document.getElementById('btn-edit');
    if (editBtn && this.onEditCallback) {
      editBtn.addEventListener('click', () => this.onEditCallback(this.tunnel.id));
    }

    // Delete button
    const deleteBtn = document.getElementById('btn-delete');
    if (deleteBtn && this.onDeleteCallback) {
      deleteBtn.addEventListener('click', () => this.handleDelete());
    }

    // Clear logs button
    const clearLogsBtn = document.getElementById('btn-clear-logs');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', () => {
        this.logs = [];
        const logTextarea = document.getElementById('tunnel-logs');
        if (logTextarea) {
          logTextarea.value = '';
        }
      });
    }
  }

  // Handle delete with confirmation
  handleDelete() {
    if (confirm(`Are you sure you want to delete "${this.tunnel.name}"?\n\nThis action cannot be undone.`)) {
      if (this.onDeleteCallback) {
        this.onDeleteCallback(this.tunnel.id);
      }
    }
  }

  // Escape HTML
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Show the panel
  show() {
    this.container.classList.remove('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('form-view').classList.add('hidden');
  }

  // Hide the panel
  hide() {
    this.container.classList.add('hidden');
  }
}

// Export
window.DetailPanel = DetailPanel;
