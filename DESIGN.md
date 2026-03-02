# SSH Tunnel Manager - 설계 고려사항

> 작성일: 2026-03-01  
> 목적: 구현 전 설계 단계에서 고려해야 할 기술적/UX적 결정사항 정리

---

## 1. 인증 방식 설계

### 1.1 지원할 인증 방법
- [ ] **비밀번호 인증**: 기본 지원, AES-256으로 암호화 저장
- [ ] **SSH Key (Passphrase 없음)**: 개인키 파일 경로 저장
- [ ] **SSH Key (Passphrase 있음)**: passphrase도 암호화 저장 필요
- [ ] **SSH Agent**: `ssh-agent` 또는 `pageant` (Windows) 연동

### 1.2 결정 필요 사항
- **처음 실행 시 마스터 키 설정**: 비밀번호 기반 vs OS 키체인 연동
- **Passphrase 캐싱**: 세션 동안 메모리에 보관할 것인가?

---

## 2. SSH 프로세스 관리 전략

### 2.1 프로세스 실행 방식
```javascript
// Option A: -f (백그라운드 포크) - 불리함
ssh -f -N -R ...
// → PID 추적 어려움, Electron 제어 불가

// Option B: Foreground + Node.js 관리 - 추천 ✅
const ssh = spawn('ssh', ['-N', '-R', ...], { detached: false });
// → 직접 PID 관리, kill 가능, stdout/stderr 캡처 가능
```

### 2.2 헬스체크 & 자동 복구
- **Heartbeat**: SSH 프로세스 살아있는지 10초마다 체크
- **자동 재연결**: 끊어지면 3회 재시도 (지수 백오프: 1s → 2s → 4s)
- **최대 재시도 횟수 초과**: 사용자 알림 + 수동 재연결 대기

### 2.3 종료 시 정리
- 앱 종료 시 모든 SSH 프로세스 graceful shutdown
- 강제 종료 시 `taskkill` / `kill` 로 정리

---

## 3. Known Hosts & 보안

### 3.1 호스트 지문 검증 (Fingerprint)
- **처음 연결 시**: 사용자에게 지문 확인 요청 (GitHub 처럼)
- **지문 불일치 시**: 경고 + 연결 거부 (MITM 공격 가능성)
- **구현**: `-o StrictHostKeyChecking=ask` 대신 직접 구현
  ```javascript
  // 첫 연결 시 지문 받아오기
  const fingerprint = execSync(`ssh-keyscan -p ${port} ${host} | ssh-keygen -lf -`);
  // 사용자 확인 후 ~/.ssh/known_hosts에 추가
  ```

### 3.2 대안: 별도 Known Hosts 파일 사용
```javascript
// 앱 전용 known_hosts 파일 사용
const knownHostsPath = path.join(appData, 'known_hosts');
const sshArgs = ['-o', `UserKnownHostsFile=${knownHostsPath}`, ...];
```

---

## 4. 포트 관리

### 4.1 로컬 포트 충돌 감지
```javascript
// 연결 전 포트 사용 가능 여부 체크
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close();
      resolve(true);
    });
    server.on('error', () => resolve(false));
  });
}
```

### 4.2 자동 포트 할당 (옵션)
- 사용자가 0 입력 시 OS가 빈 포트 할당
- 실제 할당된 포트를 UI에 표시

---

## 5. 에러 처리 매트릭스

| 에러 상황 | 감지 방법 | 처리 방안 |
|-----------|-----------|-----------|
| **인증 실패** | stderr: "Permission denied" | 즉시 알림, 재시도 중단 |
| **호스트 unreachable** | stderr: "Connection refused" | 3회 재시도 후 알림 |
| **네트워크 단절** | 프로세스 exit code, stderr | 자동 재연결 시도 |
| **포트 충돌** | 연결 전 체크 | 사용자에게 다른 포트 요청 |
| **SSH 키 권한 오류** | stderr: "Permissions too open" | 자동 chmod 600 시도 |
| **타임아웃** | stderr: "Connection timed out" | 재시도 또는 사용자 알림 |

---

## 6. OS별 차이점 처리

### 6.1 SSH 경로
```javascript
const sshPath = process.platform === 'win32' 
  ? 'C:\Windows\System32\OpenSSH\ssh.exe'  // Windows 10+
  : 'ssh';  // macOS/Linux (PATH에 있음)
```

### 6.2 프로세스 종료
```javascript
// Windows
spawn('taskkill', ['/pid', pid, '/f', '/t']);

// macOS/Linux
process.kill(pid, 'SIGTERM');  // graceful
// 또는
spawn('pkill', ['-P', pid]);   // 프로세스 그룹 종료
```

### 6.3 키체인 통합 (나중에)
- **macOS**: `security` 명령어
- **Windows**: `Credential Manager` API
- **Linux**: `libsecret` 또는 `pass`

---

## 7. UI 상태 관리 설계

### 7.1 상태 머신
```
Disconnected → Connecting → Connected
                  ↓              ↓
            Error State ←── Disconnected
```

### 7.2 실시간 업데이트 방식
- **IPC**: Main → Renderer `tunnel:status-changed` 이벤트
- **Polling**: 5초마다 상태 체크 (Renderer 요청)
- **하이브리드**: 이벤트 기반 + 주기적 싱크

### 7.3 로그 스트리밍
```javascript
// SSH verbose 출력을 실시간으로 UI에 전달
sshProcess.stderr.on('data', (data) => {
  mainWindow.webContents.send('tunnel:log', { id, data: data.toString() });
});
```

---

## 8. 설정 백업/이동성

### 8.1 내보내기/가져오기
- **형식**: JSON (암호화된 필드는 그대로)
- **마이그레이션**: 버전 정보 포함, 스키마 변경 시 업그레이드 로직

### 8.2 동기화 (나중에)
- **옵션**: iCloud Drive, Dropbox, Google Drive 동기화 고려
- **주의**: SQLite 파일 동기화 충돌 가능성

---

## 9. 리소스 관리

### 9.1 동시 연결 제한
- **기본값**: 10개 (설정에서 조정 가능)
- **이유**: SSH 프로세스당 메모리 ~5-10MB, 너무 많으면 시스템 부하

### 9.2 로그 로테이션
- 각 터널당 최근 1000줄만 메모리에 유지
- 파일로는 7일치만 보관

---

## 10. 보안 체크리스트

- [ ] 마스터 키는 메모리에만 유지 (디스크 X)
- [ ] 비밀번호는 절대 평문 저장 금지
- [ ] SSH 키 파일 읽기 권한 체크 (600 권장)
- [ ] 업데이트 매커니즘 (electron-updater) + 코드 서명
- [ ] CSP (Content Security Policy) 설정
- [ ] `contextIsolation: true`, `nodeIntegration: false` (보안 권장사항)

---

## 11. 향후 확장 고려사항

- **SOCKS 프록시**: `ssh -D` 동적 포트포워딩 지원
- **로컬 포트포워딩**: `ssh -L` (필요하다면)
- **커스텀 SSH 옵션**: 고급 사용자용 자유 입력 필드
- **단축키**: 글로벌 핫키로 빠른 연결/해제

---

## 12. 디렉토리 구조 (제안)

```
reverse-ssh-tunnel/
├── package.json
├── main.js                 # Entry point
├── src/
│   ├── main/
│   │   ├── index.js        # Main process bootstrap
│   │   ├── database.js     # SQLite 관리
│   │   ├── ssh-manager.js  # SSH 프로세스 관리
│   │   ├── crypto.js       # 암호화 유틸리티
│   │   └── ipc-handlers.js # IPC 핸들러
│   ├── renderer/
│   │   ├── index.html
│   │   ├── app.js          # Renderer entry
│   │   ├── components/     # UI 컴포넌트
│   │   └── styles.css
│   └── shared/
│       └── constants.js    # 공통 상수
├── assets/                 # 아이콘, 이미지
└── PLAN.md, DESIGN.md      # 문서
```
