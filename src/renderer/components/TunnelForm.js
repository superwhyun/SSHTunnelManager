/**
 * TunnelForm Component
 * Form for creating or editing SSH tunnels
 */
class TunnelForm {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.tunnelId = null; // null for create mode, id for edit mode
    this.onSubmitCallback = null;
    this.onCancelCallback = null;
  }

  // Set submit callback
  onSubmit(callback) {
    this.onSubmitCallback = callback;
  }

  // Set cancel callback
  onCancel(callback) {
    this.onCancelCallback = callback;
  }

  // Show form for creating new tunnel
  showCreate() {
    this.tunnelId = null;
    this.render();
    this.initAuthTypeToggle();
    this.initEventListeners();
  }

  // Show form for editing existing tunnel
  async showEdit(tunnelId) {
    this.tunnelId = tunnelId;
    try {
      const tunnel = await window.electronAPI.getTunnel(tunnelId);
      this.render(tunnel);
      this.initAuthTypeToggle();
      this.initEventListeners();
    } catch (error) {
      console.error('[TunnelForm] Failed to load tunnel:', error);
      alert('Failed to load tunnel data');
    }
  }

  // Render the form
  render(tunnel = null) {
    const isEdit = !!tunnel;
    const title = isEdit ? 'Edit Tunnel' : 'New Tunnel';
    const submitText = isEdit ? 'Update Tunnel' : 'Create Tunnel';

    const data = tunnel || {
      name: '',
      host: '',
      ssh_port: 22,
      username: '',
      auth_type: 'password',
      password: '',
      private_key_path: '',
      target_host: 'localhost',
      target_port: '',
      local_port: '',
      auto_start: false
    };

    this.container.innerHTML = `
      <div class="p-6 max-w-2xl">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-2xl font-bold text-white">${title}</h2>
          <button id="form-cancel" class="text-gray-400 hover:text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <form id="tunnel-form" class="space-y-5">
          <!-- Connection Name -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">Connection Name *</label>
            <input type="text" id="field-name" required
              class="form-input w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white focus:outline-none focus:border-blue-500"
              placeholder="e.g., Production Server"
              value="${this.escapeHtml(data.name)}">
          </div>

          <!-- SSH Server Section -->
          <div class="border border-gray-700 rounded-lg p-4 bg-gray-800">
            <h3 class="text-sm font-semibold text-blue-400 mb-3 uppercase tracking-wide">SSH Server</h3>
            
            <div class="grid grid-cols-3 gap-4 mb-4">
              <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-300 mb-1">Host *</label>
                <input type="text" id="field-host" required
                  class="form-input w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white"
                  placeholder="e.g., myserver.com"
                  value="${this.escapeHtml(data.host)}">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-1">SSH Port</label>
                <input type="number" id="field-ssh-port" min="1" max="65535"
                  class="form-input w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white"
                  value="${data.ssh_port || 22}">
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Username *</label>
              <input type="text" id="field-username" required
                class="form-input w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white"
                placeholder="e.g., root"
                value="${this.escapeHtml(data.username)}">
            </div>
          </div>

          <!-- Authentication Section -->
          <div class="border border-gray-700 rounded-lg p-4 bg-gray-800">
            <h3 class="text-sm font-semibold text-blue-400 mb-3 uppercase tracking-wide">Authentication</h3>
            
            <div class="flex gap-4 mb-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="auth-type" value="password" ${data.auth_type === 'password' ? 'checked' : ''}
                  class="w-4 h-4 text-blue-600 focus:ring-blue-500 bg-gray-700 border-gray-600">
                <span class="text-sm text-gray-300">Password</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="auth-type" value="key" ${data.auth_type === 'key' ? 'checked' : ''}
                  class="w-4 h-4 text-blue-600 focus:ring-blue-500 bg-gray-700 border-gray-600">
                <span class="text-sm text-gray-300">Private Key</span>
              </label>
            </div>

            <!-- Password field -->
            <div id="auth-password-field" class="${data.auth_type === 'key' ? 'hidden' : ''}">
              <label class="block text-sm font-medium text-gray-300 mb-1">
                ${isEdit ? 'Password (leave empty to keep current)' : 'Password *'}
              </label>
              <input type="password" id="field-password"
                class="form-input w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white"
                placeholder="Enter password"
                ${!isEdit ? 'required' : ''}>
            </div>

            <!-- Private Key field -->
            <div id="auth-key-field" class="${data.auth_type === 'password' ? 'hidden' : ''}">
              <label class="block text-sm font-medium text-gray-300 mb-1">Private Key Path *</label>
              <div class="flex gap-2">
                <input type="text" id="field-private-key"
                  class="form-input flex-1 px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white"
                  placeholder="/path/to/private_key"
                  value="${this.escapeHtml(data.private_key_path || '')}">
                <button type="button" id="btn-browse-key" 
                  class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-sm font-medium transition-colors">
                  Browse...
                </button>
              </div>
              <p class="text-xs text-gray-500 mt-1">Path to your SSH private key file (e.g., ~/.ssh/id_rsa)</p>
            </div>
          </div>

          <!-- Tunnel Settings Section -->
          <div class="border border-gray-700 rounded-lg p-4 bg-gray-800">
            <h3 class="text-sm font-semibold text-blue-400 mb-3 uppercase tracking-wide">Tunnel Settings</h3>
            
            <div class="grid grid-cols-3 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-1">Target Host</label>
                <input type="text" id="field-target-host"
                  class="form-input w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white"
                  placeholder="localhost"
                  value="${this.escapeHtml(data.target_host || 'localhost')}">
                <p class="text-xs text-gray-500 mt-1">Remote service host</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-1">Target Port *</label>
                <input type="number" id="field-target-port" min="1" max="65535" required
                  class="form-input w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white"
                  placeholder="e.g., 8080"
                  value="${data.target_port || ''}">
                <p class="text-xs text-gray-500 mt-1">Remote service port</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-1">Local Port *</label>
                <input type="number" id="field-local-port" min="1" max="65535" required
                  class="form-input w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white"
                  placeholder="e.g., 3000"
                  value="${data.local_port || ''}">
                <p class="text-xs text-gray-500 mt-1">Local bind port</p>
              </div>
            </div>
          </div>

          <!-- Auto Start -->
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" id="field-auto-start" ${data.auto_start ? 'checked' : ''}
              class="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500">
            <span class="text-sm text-gray-300">Auto-start tunnel when application launches</span>
          </label>

          <!-- Form Actions -->
          <div class="flex gap-3 pt-4 border-t border-gray-700">
            <button type="submit" 
              class="flex-1 btn-primary px-6 py-2.5 rounded-lg font-medium text-white">
              ${submitText}
            </button>
            <button type="button" id="btn-form-cancel"
              class="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-white transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    `;
  }

  // Initialize auth type toggle
  initAuthTypeToggle() {
    const authRadios = document.querySelectorAll('input[name="auth-type"]');
    const passwordField = document.getElementById('auth-password-field');
    const keyField = document.getElementById('auth-key-field');
    const passwordInput = document.getElementById('field-password');

    authRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.value === 'password') {
          passwordField.classList.remove('hidden');
          keyField.classList.add('hidden');
          if (passwordInput && !this.tunnelId) {
            passwordInput.required = true;
          }
        } else {
          passwordField.classList.add('hidden');
          keyField.classList.remove('hidden');
          if (passwordInput) {
            passwordInput.required = false;
          }
        }
      });
    });

    // Browse button (file picker would be handled by Electron dialog in main process)
    const browseBtn = document.getElementById('btn-browse-key');
    if (browseBtn) {
      browseBtn.addEventListener('click', () => {
        // For now, just prompt for path. In real implementation,
        // this would use ipcRenderer to open a file dialog
        const path = prompt('Enter the full path to your private key file:');
        if (path) {
          document.getElementById('field-private-key').value = path;
        }
      });
    }
  }

  // Initialize form event listeners
  initEventListeners() {
    // Cancel buttons
    const cancelBtns = [
      document.getElementById('form-cancel'),
      document.getElementById('btn-form-cancel')
    ];
    cancelBtns.forEach(btn => {
      if (btn && this.onCancelCallback) {
        btn.addEventListener('click', () => this.onCancelCallback());
      }
    });

    // Form submit
    const form = document.getElementById('tunnel-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSubmit();
      });
    }
  }

  // Handle form submission
  async handleSubmit() {
    const authType = document.querySelector('input[name="auth-type"]:checked').value;
    
    const data = {
      name: document.getElementById('field-name').value.trim(),
      host: document.getElementById('field-host').value.trim(),
      ssh_port: parseInt(document.getElementById('field-ssh-port').value) || 22,
      username: document.getElementById('field-username').value.trim(),
      auth_type: authType,
      target_host: document.getElementById('field-target-host').value.trim() || 'localhost',
      target_port: parseInt(document.getElementById('field-target-port').value),
      local_port: parseInt(document.getElementById('field-local-port').value),
      auto_start: document.getElementById('field-auto-start').checked
    };

    // Add auth-specific fields
    if (authType === 'password') {
      const password = document.getElementById('field-password').value;
      if (password) {
        data.password = password;
      }
    } else {
      data.private_key_path = document.getElementById('field-private-key').value.trim();
    }

    try {
      if (this.tunnelId) {
        // Update existing
        await window.electronAPI.updateTunnel(this.tunnelId, data);
      } else {
        // Create new
        await window.electronAPI.createTunnel(data);
      }

      if (this.onSubmitCallback) {
        this.onSubmitCallback();
      }
    } catch (error) {
      console.error('[TunnelForm] Submit failed:', error);
      alert(`Failed to save tunnel: ${error.message}`);
    }
  }

  // Escape HTML
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Show the form container
  show() {
    this.container.classList.remove('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('detail-view').classList.add('hidden');
  }

  // Hide the form container
  hide() {
    this.container.classList.add('hidden');
  }
}

// Export
window.TunnelForm = TunnelForm;
