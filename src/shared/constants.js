/**
 * Shared constants for the application
 */

// IPC Channel Names
const IPC_CHANNELS = {
  // Database operations
  DB_TUNNEL_CREATE: 'db:tunnel:create',
  DB_TUNNEL_GET_ALL: 'db:tunnel:getAll',
  DB_TUNNEL_GET: 'db:tunnel:get',
  DB_TUNNEL_UPDATE: 'db:tunnel:update',
  DB_TUNNEL_DELETE: 'db:tunnel:delete',
  
  // Crypto operations
  CRYPTO_SET_MASTER_KEY: 'crypto:setMasterKey',
  CRYPTO_HAS_MASTER_KEY: 'crypto:hasMasterKey',
  
  // SSH Tunnel operations
  SSH_CONNECT: 'ssh:connect',
  SSH_DISCONNECT: 'ssh:disconnect',
  SSH_STATUS: 'ssh:status',
  SSH_LOGS: 'ssh:logs',
  
  // Events from main to renderer
  TUNNEL_STATUS: 'tunnel:status',
  TUNNEL_LOG: 'tunnel:log',
};

// Authentication Types
const AUTH_TYPES = {
  PASSWORD: 'password',
  KEY: 'key',
};

// Default values
const DEFAULTS = {
  SSH_PORT: 22,
  TARGET_HOST: 'localhost',
  AUTO_START: 0,
  RECONNECT: 1,
};

// Database table name
const DB_TABLES = {
  TUNNELS: 'tunnels',
};

module.exports = {
  IPC_CHANNELS,
  AUTH_TYPES,
  DEFAULTS,
  DB_TABLES,
};
