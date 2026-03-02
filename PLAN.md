# SSH Tunnel Manager - 개발 계획

> 생성일: 2026-03-01  
> 목표: 크로스 플랫폼 SSH Tunnel 관리 앱 개발

---

## 1. 기술 스택

| 항목 | 선택 | 이유 |
|------|------|------|
| **프레임워크** | Electron | 크로스 플랫폼, Node.js 기반으로 SSH 커맨드 실행 용이 |
| **프론트엔드** | HTML/CSS/JS + TailwindCSS | 가벼운 UI, 빠른 개발 |
| **데이터 저장** | SQLite (better-sqlite3) | 로컬 파일 기반, 설정/비밀번호 저장 |
| **SSH 실행** | Node.js child_process | 시스템의 ssh 명령 직접 호출 |
| **암호화** | Node.js crypto | 비밀번호 등 민감정보 암호화 저장 |

---

## 2. 아키텍처

```
┌─────────────────────────────────────────┐
│           Electron Main Process         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │ SSH     │  │ Config  │  │ Tray    │  │
│  │ Manager │  │ Store   │  │ Manager │  │
│  └────┬────┘  └────┬────┘  └────┬────┘  │
│       │            │            │        │
│  ┌────┴────────────┴────────────┴────┐  │
│  │         IPC Communication          │  │
│  └────────────────┬───────────────────┘  │
└───────────────────┼──────────────────────┘
                    │
┌───────────────────┼──────────────────────┐
│  Renderer Process │ (UI Window)          │
│  ┌────────────────┼──────────────────┐   │
│  │  Tunnel List   │  Connection Form  │   │
│  │  Status Panel  │  Settings         │   │
│  └────────────────┴──────────────────┘   │
└──────────────────────────────────────────┘
```

---

## 3. 개발 단계

### Phase 1: 기반 구축 ✅ / 🔄 / ⬜
- [ ] Electron 앱 기본 구조
- [ ] SQLite 스키마 설계
- [ ] 설정 암호화 유틸리티
- [ ] 기본 UI 레이아웃

### Phase 2: 핵심 SSH 기능
- [ ] SSH 커맨드 빌더
- [ ] child_process로 SSH 실행
- [ ] 연결 상태 모니터링
- [ ] 로그 스트리밍

### Phase 3: 관리 기능
- [ ] 터널 CRUD (생성/조회/수정/삭제)
- [ ] 연결/해제 토글
- [ ] 여러 터널 동시 관리
- [ ] 시스템 트레이 통합

### Phase 4: 고급 기능
- [ ] 자동 재연결
- [ ] 시작 시 자동 실행
- [ ] 포트 충돌 감지
- [ ] 연결 통계/로그

---

## 4. 데이터 모델

```javascript
// Tunnel 설정 구조
{
  id: "uuid",
  name: "사용자 정의 이름",
  
  // 원격 서버 (터널을 뚫을 대상)
  remote: {
    host: "remote.server.com",
    port: 22,
    username: "user",
    password: "encrypted",       // 또는
    privateKey: "~/.ssh/id_rsa", // 키 인증
    authType: "password|key"
  },
  
  // 터널 설정
  tunnel: {
    localPort: 8080,       // 내 로컬에서 접속할 포트
    targetHost: "localhost", // 터널 끝에서 실제 접속할 호스트
    targetPort: 3000,      // 터널 끝에서 실제 접속할 포트
    remoteBindPort: 9000   // (선택) 리모트에 바인딩할 포트
  },
  
  // 메타데이터
  createdAt: timestamp,
  autoStart: false,
  reconnect: true
}
```

---

## 5. SSH 명령어 구조

```bash
# 기본 리버스 터널 (원격 서버의 8080을 내 로컬 3000으로)
ssh -N -R 8080:localhost:3000 user@remote.server.com

# 옵션 설명
-N  # 원격 명령 실행 안함 (터널 전용)
-R  # 리버스 포워딩 (원격:로컬)
-f  # 백그라운드 실행 (대안: Electron에서 직접 관리)
-v  # verbose (디버깅용)
-i  # private key 경로
-p  # SSH 포트 (기본 22)
```

---

## 6. IPC 인터페이스

```javascript
// Main Process에서 제공할 API
ipcMain.handle('tunnel:list', () => {...})
ipcMain.handle('tunnel:create', (data) => {...})
ipcMain.handle('tunnel:update', (id, data) => {...})
ipcMain.handle('tunnel:delete', (id) => {...})
ipcMain.handle('tunnel:connect', (id) => {...})
ipcMain.handle('tunnel:disconnect', (id) => {...})
ipcMain.handle('tunnel:status', (id) => {...})
ipcMain.handle('tunnel:logs', (id) => {...})
```

---

## 7. 에이전트 분업

| 에이전트 | 담당 | 파일 |
|----------|------|------|
| **Agent 1** | Backend/Core (Main Process) | `main.js`, `db/`, `ssh-manager.js`, `ipc-handlers.js` |
| **Agent 2** | Frontend (Renderer Process) | `index.html`, `renderer.js`, `styles.css` |

---

## 8. 보안 체크리스트

- [ ] 비밀번호 AES-256 암호화 저장 (마스터 키 사용)
- [ ] SSH Key 인증 지원 (개인키 경로 저장, 내용 저장 안함)
- [ ] Known Hosts 자동 추가 옵션
- [ ] 마스터 키는 OS 키체인 활용 고려

---

## 9. 다음 세션 진행 시 참고

1. **Phase 1부터 시작** - 기본 구조 먼저 잡기
2. **Agent 1, 2 병렬 작업** - IPC 인터페이스 먼저 정의 후 각자 구현
3. **package.json** - 의존성 설치 체크: `electron`, `better-sqlite3`
