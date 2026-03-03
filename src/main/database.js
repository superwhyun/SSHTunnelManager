/**
 * Database module for SQLite management
 * Handles tunnel configurations with encrypted sensitive data
 */

const Database = require('better-sqlite3');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('./crypto');

let db = null;

/**
 * Initialize database connection and create tables
 * @returns {Database} Database instance
 */
function initDatabase() {
  if (db) {
    return db;
  }
  
  // Get user data path for database storage
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'data.db');
  
  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  
  // Open database
  db = new Database(dbPath);
  
  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  
  // Create tables
  createTables();
  
  console.log(`Database initialized at: ${dbPath}`);
  return db;
}

/**
 * Create database tables
 */
function createTables() {
  const createTunnelsTable = `
    CREATE TABLE IF NOT EXISTS tunnels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER DEFAULT 22,
      username TEXT NOT NULL,
      auth_type TEXT CHECK(auth_type IN ('password', 'key')) DEFAULT 'password',
      encrypted_password TEXT,
      private_key_path TEXT,
      encrypted_passphrase TEXT,
      local_port INTEGER NOT NULL,
      target_host TEXT DEFAULT 'localhost',
      target_port INTEGER NOT NULL,
      remote_bind_port INTEGER,
      url TEXT,
      auto_start BOOLEAN DEFAULT 0,
      reconnect BOOLEAN DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `;
  
  db.exec(createTunnelsTable);
  
  // Create indexes for better query performance
  db.exec('CREATE INDEX IF NOT EXISTS idx_tunnels_name ON tunnels(name)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tunnels_auto_start ON tunnels(auto_start)');
  
  // Migration: Add url column if it doesn't exist (for existing databases)
  migrateAddUrlColumn();
}

/**
 * Migration: Add url column to existing tables
 */
function migrateAddUrlColumn() {
  try {
    const columns = db.prepare("PRAGMA table_info(tunnels)").all();
    const hasUrlColumn = columns.some(col => col.name === 'url');
    
    if (!hasUrlColumn) {
      db.exec('ALTER TABLE tunnels ADD COLUMN url TEXT');
      console.log('[DB] Migration: Added url column to tunnels table');
    }
  } catch (error) {
    console.error('[DB] Migration error:', error);
  }
}

/**
 * Generate unique ID
 * @returns {string} UUID-like unique identifier
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new tunnel configuration
 * @param {Object} tunnelData - Tunnel configuration data
 * @returns {Object} Created tunnel with id
 */
function createTunnel(tunnelData) {
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  const {
    name,
    host,
    port = 22,
    username,
    auth_type = 'password',
    password,
    private_key_path,
    passphrase,
    local_port,
    target_host = 'localhost',
    target_port,
    remote_bind_port,
    url,
    auto_start = 0,
    reconnect = 1,
  } = tunnelData;
  
  // Validate required fields
  if (!name || !host || !username || !local_port || !target_port) {
    throw new Error('Missing required fields');
  }
  
  // Encrypt sensitive data
  const encrypted_password = password ? crypto.encrypt(password) : null;
  const encrypted_passphrase = passphrase ? crypto.encrypt(passphrase) : null;
  
  const id = generateId();
  
  const stmt = db.prepare(`
    INSERT INTO tunnels (
      id, name, host, port, username, auth_type,
      encrypted_password, private_key_path, encrypted_passphrase,
      local_port, target_host, target_port, remote_bind_port,
      url, auto_start, reconnect
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    name,
    host,
    port,
    username,
    auth_type,
    encrypted_password,
    private_key_path || null,
    encrypted_passphrase,
    local_port,
    target_host,
    target_port,
    remote_bind_port || null,
    url || null,
    auto_start ? 1 : 0,
    reconnect ? 1 : 0
  );
  
  return getTunnel(id);
}

/**
 * Get tunnel by ID
 * @param {string} id - Tunnel ID
 * @param {boolean} includeEncrypted - Whether to include decrypted sensitive data
 * @returns {Object|null} Tunnel configuration
 */
function getTunnel(id, includeEncrypted = false) {
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  const stmt = db.prepare('SELECT * FROM tunnels WHERE id = ?');
  const tunnel = stmt.get(id);
  
  if (!tunnel) {
    return null;
  }
  
  return formatTunnel(tunnel, includeEncrypted);
}

/**
 * Get all tunnels
 * @param {boolean} includeEncrypted - Whether to include decrypted sensitive data
 * @returns {Array} Array of tunnel configurations
 */
function getAllTunnels(includeEncrypted = false) {
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  const stmt = db.prepare('SELECT * FROM tunnels ORDER BY created_at DESC');
  const tunnels = stmt.all();
  
  return tunnels.map(tunnel => formatTunnel(tunnel, includeEncrypted));
}

/**
 * Update tunnel configuration
 * @param {string} id - Tunnel ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated tunnel
 */
function updateTunnel(id, updates) {
  console.log('[DB] updateTunnel called with:', id, JSON.stringify(updates));
  
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  const existing = getTunnel(id, true);
  if (!existing) {
    throw new Error('Tunnel not found');
  }
  
  const allowedFields = [
    'name', 'host', 'port', 'username', 'auth_type',
    'local_port', 'target_host', 'target_port', 'remote_bind_port',
    'url', 'auto_start', 'reconnect', 'private_key_path'
  ];
  
  const setClauses = [];
  const values = [];
  
  // Handle regular fields
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      
      // Convert boolean to integer for SQLite
      if (field === 'auto_start' || field === 'reconnect') {
        values.push(updates[field] ? 1 : 0);
      } else {
        values.push(updates[field]);
      }
    }
  }
  
  // Handle encrypted fields
  if (updates.password !== undefined) {
    setClauses.push('encrypted_password = ?');
    values.push(updates.password ? crypto.encrypt(updates.password) : null);
  }
  
  if (updates.passphrase !== undefined) {
    setClauses.push('encrypted_passphrase = ?');
    values.push(updates.passphrase ? crypto.encrypt(updates.passphrase) : null);
  }
  
  if (setClauses.length === 0) {
    return existing;
  }
  
  values.push(id);
  
  const stmt = db.prepare(`
    UPDATE tunnels SET ${setClauses.join(', ')} WHERE id = ?
  `);
  
  stmt.run(...values);
  
  return getTunnel(id);
}

/**
 * Delete tunnel by ID
 * @param {string} id - Tunnel ID
 * @returns {boolean} True if deleted
 */
function deleteTunnel(id) {
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  const stmt = db.prepare('DELETE FROM tunnels WHERE id = ?');
  const result = stmt.run(id);
  
  return result.changes > 0;
}

/**
 * Format tunnel object for return
 * @param {Object} tunnel - Raw database row
 * @param {boolean} includeEncrypted - Whether to decrypt sensitive data
 * @returns {Object} Formatted tunnel object
 */
function formatTunnel(tunnel, includeEncrypted = false) {
  const formatted = {
    id: tunnel.id,
    name: tunnel.name,
    host: tunnel.host,
    port: tunnel.port,
    username: tunnel.username,
    auth_type: tunnel.auth_type,
    local_port: tunnel.local_port,
    target_host: tunnel.target_host,
    target_port: tunnel.target_port,
    remote_bind_port: tunnel.remote_bind_port,
    url: tunnel.url,
    auto_start: Boolean(tunnel.auto_start),
    reconnect: Boolean(tunnel.reconnect),
    created_at: tunnel.created_at,
    private_key_path: tunnel.private_key_path,
  };
  
  // Include decrypted data only when explicitly requested
  if (includeEncrypted) {
    try {
      if (tunnel.encrypted_password) {
        formatted.password = crypto.decrypt(tunnel.encrypted_password);
      }
      if (tunnel.encrypted_passphrase) {
        formatted.passphrase = crypto.decrypt(tunnel.encrypted_passphrase);
      }
    } catch (error) {
      console.error('Failed to decrypt sensitive data:', error.message);
      // Don't expose partial data on decryption failure
    }
  }
  
  // Always indicate if encrypted fields exist (without revealing values)
  formatted.has_password = !!tunnel.encrypted_password;
  formatted.has_passphrase = !!tunnel.encrypted_passphrase;
  
  return formatted;
}

/**
 * Close database connection
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('Database connection closed');
  }
}

module.exports = {
  initDatabase,
  createTunnel,
  getTunnel,
  getAllTunnels,
  updateTunnel,
  deleteTunnel,
  closeDatabase,
};
