# SSH 프로세스 직접 관리 가이드

> Node.js에서 SSH 프로세스를 직접 생성하고 모니터링하는 방법

---

## 1. 왜 `-f` (백그라운드) 옵션을 쓰지 않는가?

```bash
# ❌ 피해야 할 방식
ssh -f -N -R 8080:localhost:3000 user@remote.com
```

**문제점:**
- 포크된 후 부모 프로세스와 분리됨
- PID를 잃어버려 나중에 종료할 수 없음
- stdout/stderr 캡처 불가능 (로그를 못 봄)
- 연결 상태 실시간 확인 불가

---

## 2. 직접 관리 방식 (권장)

```javascript
const { spawn } = require('child_process');

// ✅ SSH 프로세스를 직접 생성하고 참조 보관
const sshProcess = spawn('ssh', [
  '-N',              // 명령 실행 안함
  '-R', '8080:localhost:3000',  // 리버스 터널
  '-p', '22',        // SSH 포트
  '-o', 'ServerAliveInterval=30',  // 30초마다 heartbeat
  '-o', 'ServerAliveCountMax=3',   // 3회 실패시 종료
  'user@remote.com'
], {
  stdio: ['pipe', 'pipe', 'pipe']  // stdin, stdout, stderr 모두 파이프로 연결
});

// 프로세스 정보 저장
const tunnelInfo = {
  id: 'tunnel-uuid',
  process: sshProcess,
  pid: sshProcess.pid,
  status: 'connecting',
  startTime: Date.now()
};
```

---

## 3. 프로세스 모니터링

### 3.1 로그 캡처 (stderr가 SSH 로그)
```javascript
// SSH verbose 로그 실시간 캡처
sshProcess.stderr.on('data', (data) => {
  const log = data.toString();
  console.log(`[SSH Log] ${log}`);
  
  // 특정 패턴으로 상태 감지
  if (log.includes('Entering interactive session')) {
    tunnelInfo.status = 'connected';
    notifyUI('connected');
  }
  if (log.includes('Permission denied')) {
    tunnelInfo.status = 'auth_failed';
    notifyUI('auth_failed', log);
  }
  if (log.includes('Connection refused')) {
    tunnelInfo.status = 'connection_refused';
    notifyUI('connection_refused');
  }
});
```

### 3.2 프로세스 종료 감지
```javascript
sshProcess.on('exit', (code, signal) => {
  console.log(`SSH exited with code ${code}, signal ${signal}`);
  
  if (code === 0) {
    tunnelInfo.status = 'disconnected';
  } else {
    tunnelInfo.status = 'error';
    tunnelInfo.errorCode = code;
  }
  
  // 자동 재연결 로직
  if (tunnelInfo.config.reconnect && !tunnelInfo.manualStop) {
    scheduleReconnect(tunnelInfo);
  }
});

sshProcess.on('error', (err) => {
  console.error('SSH process error:', err);
  tunnelInfo.status = 'error';
  tunnelInfo.error = err.message;
});
```

---

## 4. 종료 처리

### 4.1 Graceful 종료 (권장)
```javascript
function stopTunnel(tunnelId) {
  const tunnel = tunnels.get(tunnelId);
  if (!tunnel || !tunnel.process) return;
  
  tunnel.manualStop = true;  // 자동 재연결 방지
  
  // 먼저 SIGTERM 시도 (graceful shutdown)
  tunnel.process.kill('SIGTERM');
  
  // 5초 후에도 안 끝나면 SIGKILL
  setTimeout(() => {
    if (!tunnel.process.killed) {
      tunnel.process.kill('SIGKILL');
    }
  }, 5000);
}
```

### 4.2 OS별 강제 종료
```javascript
const { spawn: spawnCmd } = require('child_process');

function forceKill(process, pid) {
  if (process.platform === 'win32') {
    // Windows: taskkill로 프로세스 트리 종료
    spawnCmd('taskkill', ['/pid', pid, '/f', '/t']);
  } else {
    // macOS/Linux: 프로세스 그룹 종료
    process.kill(-pid, 'SIGKILL');  // 음수 PID = 프로세스 그룹
  }
}
```

---

## 5. 비밀번호 인증 처리

```javascript
// 비밀번호 입력이 필요한 경우
const sshProcess = spawn('ssh', [
  '-o', 'PasswordAuthentication=yes',
  '-o', 'PreferredAuthentications=password',
  '-o', 'StrictHostKeyChecking=no',  // 첫 연결 자동 수락
  '-N', '-R', '8080:localhost:3000',
  'user@remote.com'
], { stdio: ['pipe', 'pipe', 'pipe'] });

// SSH가 비밀번호를 요청하면 stdin으로 전송
sshProcess.stdout.on('data', (data) => {
  const output = data.toString();
  if (output.includes('password:') || output.includes('Password:')) {
    sshProcess.stdin.write(decryptedPassword + '\n');
  }
});

// 또는 SSH_ASKPASS 환경변수 사용 (더 안전)
const { spawn } = require('child_process');

function createSSHWithPassword(host, port, user, password, tunnelConfig) {
  // 임시 스크립트 생성 (비밀번호 응답용)
  const askpassScript = path.join(os.tmpdir(), `ssh-askpass-${Date.now()}.sh`);
  fs.writeFileSync(askpassScript, `#!/bin/sh\necho "${password}"`, { mode: 0o700 });
  
  const sshProcess = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-N', '-R', `${tunnelConfig.remotePort}:${tunnelConfig.targetHost}:${tunnelConfig.targetPort}`,
    '-p', port.toString(),
    `${user}@${host}`
  ], {
    env: {
      ...process.env,
      SSH_ASKPASS: askpassScript,      // 비밀번호 제공 스크립트
      DISPLAY: ':0'                     // SSH_ASKPASS는 DISPLAY 필요
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // 종료 시 임시 파일 삭제
  sshProcess.on('exit', () => {
    fs.unlinkSync(askpassScript);
  });
  
  return sshProcess;
}
```

---

## 6. 완전한 TunnelManager 클래스 예시

```javascript
const { spawn } = require('child_process');
const EventEmitter = require('events');

class SSHManager extends EventEmitter {
  constructor() {
    super();
    this.tunnels = new Map();  // id -> tunnelInfo
  }
  
  connect(id, config) {
    const { host, port, username, password, privateKey, tunnel } = config;
    
    const args = ['-N', '-v'];  // -v: verbose (로그용)
    
    // 터널 설정
    args.push('-R', `${tunnel.remoteBindPort}:${tunnel.targetHost}:${tunnel.targetPort}`);
    
    // 포트
    args.push('-p', port.toString());
    
    // 키 인증
    if (privateKey) {
      args.push('-i', privateKey);
    }
    
    // Keepalive
    args.push('-o', 'ServerAliveInterval=30');
    args.push('-o', 'ServerAliveCountMax=3');
    args.push('-o', 'ExitOnForwardFailure=yes');  // 포트포워딩 실패 시 종료
    
    // 호스트
    args.push(`${username}@${host}`);
    
    const sshProcess = spawn('ssh', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const tunnelInfo = {
      id,
      config,
      process: sshProcess,
      pid: sshProcess.pid,
      status: 'connecting',
      logs: [],
      startTime: Date.now(),
      reconnectAttempts: 0
    };
    
    this.tunnels.set(id, tunnelInfo);
    
    // 로그 캡처
    sshProcess.stderr.on('data', (data) => {
      const log = data.toString();
      tunnelInfo.logs.push({ time: Date.now(), data: log });
      this.emit('log', id, log);
      
      // 상태 감지
      this._parseLog(tunnelInfo, log);
    });
    
    // 종료 처리
    sshProcess.on('exit', (code) => {
      tunnelInfo.status = code === 0 ? 'disconnected' : 'error';
      this.emit('disconnected', id, code);
      
      // 자동 재연결
      if (config.reconnect && !tunnelInfo.manualStop) {
        this._scheduleReconnect(id);
      }
    });
    
    return tunnelInfo;
  }
  
  disconnect(id) {
    const tunnel = this.tunnels.get(id);
    if (!tunnel || !tunnel.process) return false;
    
    tunnel.manualStop = true;
    tunnel.process.kill('SIGTERM');
    
    // 5초 후 강제 종료
    setTimeout(() => {
      if (!tunnel.process.killed) {
        tunnel.process.kill('SIGKILL');
      }
    }, 5000);
    
    return true;
  }
  
  getStatus(id) {
    return this.tunnels.get(id)?.status || 'unknown';
  }
  
  getLogs(id, limit = 100) {
    const tunnel = this.tunnels.get(id);
    if (!tunnel) return [];
    return tunnel.logs.slice(-limit);
  }
  
  _parseLog(tunnel, log) {
    if (log.includes('Entering interactive session')) {
      tunnel.status = 'connected';
      tunnel.reconnectAttempts = 0;
      this.emit('connected', tunnel.id);
    }
    if (log.includes('Permission denied')) {
      tunnel.status = 'auth_failed';
      tunnel.manualStop = true;  // 재연결 중단
      this.emit('error', tunnel.id, 'auth_failed');
    }
  }
  
  _scheduleReconnect(id) {
    const tunnel = this.tunnels.get(id);
    if (!tunnel) return;
    
    if (tunnel.reconnectAttempts >= 3) {
      this.emit('error', id, 'max_reconnect_attempts');
      return;
    }
    
    tunnel.reconnectAttempts++;
    const delay = Math.pow(2, tunnel.reconnectAttempts) * 1000;  // 2, 4, 8초
    
    this.emit('reconnecting', id, tunnel.reconnectAttempts, delay);
    
    setTimeout(() => {
      this.connect(id, tunnel.config);
    }, delay);
  }
}

module.exports = { SSHManager };
```

---

## 7. 사용 예시

```javascript
const { SSHManager } = require('./ssh-manager');

const manager = new SSHManager();

// 이벤트 리스너
manager.on('connected', (id) => console.log(`Tunnel ${id} connected`));
manager.on('disconnected', (id, code) => console.log(`Tunnel ${id} disconnected: ${code}`));
manager.on('log', (id, log) => console.log(`[${id}] ${log}`));

// 연결
manager.connect('tunnel-1', {
  host: 'remote.server.com',
  port: 22,
  username: 'admin',
  privateKey: '~/.ssh/id_rsa',
  tunnel: {
    remoteBindPort: 8080,
    targetHost: 'localhost',
    targetPort: 3000
  },
  reconnect: true
});

// 10초 후 종료
setTimeout(() => {
  manager.disconnect('tunnel-1');
}, 10000);
```
