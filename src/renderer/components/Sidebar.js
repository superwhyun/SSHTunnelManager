/**
 * Sidebar Component
 * Displays the list of tunnels and handles tunnel selection
 */
class Sidebar {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.tunnels = [];
    this.selectedId = null;
    this.onSelectCallback = null;
    this.onAddCallback = null;
  }

  // Set callback for tunnel selection
  onSelect(callback) {
    this.onSelectCallback = callback;
  }

  // Set callback for add button click
  onAdd(callback) {
    this.onAddCallback = callback;
  }

  // Load and render all tunnels
  async loadTunnels() {
    try {
      this.tunnels = await window.electronAPI.getAllTunnels();
      this.render();
    } catch (error) {
      console.error('[Sidebar] Failed to load tunnels:', error);
      this.container.innerHTML = `
        <div class="text-center text-red-400 py-8 text-sm">
          Failed to load tunnels<br>
          <span class="text-xs text-gray-500">${error.message}</span>
        </div>
      `;
    }
  }

  // Select a tunnel by ID
  selectTunnel(id) {
    this.selectedId = id;
    this.render();
    if (this.onSelectCallback) {
      this.onSelectCallback(id);
    }
  }

  // Update tunnel status (called from event listener)
  updateTunnelStatus(tunnelId, status) {
    const tunnel = this.tunnels.find(t => t.id === tunnelId);
    if (tunnel) {
      tunnel.status = status;
      this.render();
    }
  }

  // Get status color class
  getStatusClass(status) {
    switch (status) {
      case 'connected': return 'status-connected';
      case 'connecting': return 'status-connecting';
      case 'disconnected':
      default: return 'status-disconnected';
    }
  }

  // Get status text
  getStatusText(status) {
    switch (status) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'disconnected':
      default: return 'Disconnected';
    }
  }

  // Render the sidebar
  render() {
    if (this.tunnels.length === 0) {
      this.container.innerHTML = `
        <div class="text-center text-gray-500 py-8 text-sm">
          <div class="mb-2">📭</div>
          No tunnels yet<br>
          <span class="text-xs">Click "New Tunnel" to create one</span>
        </div>
      `;
      return;
    }

    this.container.innerHTML = this.tunnels.map(tunnel => {
      const statusClass = this.getStatusClass(tunnel.status || 'disconnected');
      const statusText = this.getStatusText(tunnel.status || 'disconnected');
      const isActive = tunnel.id === this.selectedId;
      
      return `
        <div 
          class="tunnel-item p-3 rounded-lg cursor-pointer ${isActive ? 'active' : ''}"
          data-id="${tunnel.id}"
        >
          <div class="flex items-center gap-3">
            <span class="status-dot ${statusClass}" title="${statusText}"></span>
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm truncate">${this.escapeHtml(tunnel.name)}</div>
              <div class="text-xs text-gray-400 truncate">
                ${this.escapeHtml(tunnel.host)}:${tunnel.ssh_port}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers
    this.container.querySelectorAll('.tunnel-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const id = parseInt(item.dataset.id);
        this.selectTunnel(id);
      });
    });
  }

  // Escape HTML to prevent XSS
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize event listeners
  init() {
    // Add button
    const addBtn = document.getElementById('btn-add');
    if (addBtn && this.onAddCallback) {
      addBtn.addEventListener('click', () => this.onAddCallback());
    }

    // Initial load
    this.loadTunnels();
  }
}

// Export for use in other scripts
window.Sidebar = Sidebar;
