# 🚗 CBTI — Car Buying Type Indicator

당신의 라이프스타일에 맞는 차를 찾아주는 5분짜리 3D 인터랙티브 게임.

> 아기차를 골라 — 먹이를 주고 — 친구와 놀고 — 드라이브를 하면서 당신의 성향을 분석합니다.
> 게임이 끝나면 4축 CBTI 코드와 함께 추천 차량 + 금융 플랜이 나와요.

🎮 **[지금 플레이하기 →](https://jungkunkim-glitch.github.io/cbti-3d-game/)**

---

## ✨ 특징

- **풀 3D**: Three.js 기반, chibi 스타일 귀여운 차 + 캔디 월드
- **6단계 미니게임**:
  1. 🚙 차 종류 선택 (패밀리 / 스포츠 / 작은차)
  2. 🥚 부화 + 이름 짓기
  3. 🍼 먹이주기 — 조이스틱/WASD로 차를 움직여 음식 먹기 (전기/휘발유 → 친환경 vs 프리미엄 성향)
  4. 👋 친구 만남 → 사이먼 게임
  5. 🍪 쿠키런 스타일 사이드 러너 (점프/슬라이드)
  6. 💎 카드 매칭 업그레이드 → 파이널 레이스
- **CBTI 4축 분석**:
  - **A**ctive / **R**outine — 활동 성향
  - **P**remium / **E**conomy — 소비 성향
  - **S**afe / **T**hrill — 안전 성향
  - **I**nvest / **F**lex — 금융 성향 (일시불·할부 / 리스·렌트)
- **연료 선호 분석** — 4가지 연료 픽업 패턴으로 EV / 휘발유 / 프리미엄 추천
- **사운드** — WebAudio 폴리포닉 BGM + 리버브/딜레이 SFX
- **모바일 가로 모드 최적화** — 가상 조이스틱, 터치 점프/슬라이드, 회전 안내

## 🕹️ 조작

| 상황 | 키보드 | 터치 |
|---|---|---|
| 먹이주기 | WASD / 화살표 | 좌측 조이스틱 |
| 쿠키런 | Space (점프), ↓ (슬라이드) | ⬆ / ⬇ 버튼 |
| 선택 | 마우스 클릭 | 탭 |

## 🎯 결과 예시

게임 끝나면 이런 결과가 나옵니다:
```
APSF · Family Premium Voyager
🚗 추천: 기아 EV9 (대형 전기 SUV · 350kW 급속충전)
💳 금융: 60개월 할부 · 월 안정 납입
⚡ 급속 EV 선호 — 시간을 아끼는 효율형 EV 사용자
```

## 🛠️ 로컬 실행

```bash
# 그냥 브라우저에서 index.html을 열어도 되지만,
# ES module CDN 임포트 때문에 정적 서버가 필요합니다.

python3 -m http.server 8000
# 또는
npx serve .
```

브라우저에서 `http://localhost:8000` 접속.

### 🔧 디버그 단축

URL hash로 특정 씬에 바로 진입:
- `#race` — 쿠키런 레이스
- `#destination` — 목적지 선택
- `#friend` — 친구 방문
- `#result` — 결과 화면
- `#stage` — 유치원 먹이주기

## 📦 기술 스택

- **Three.js 0.160** (CDN, ES module)
- **EffectComposer** + UnrealBloomPass — 빛 발광
- **WebAudio API** — 절차적 사운드 합성 (외부 파일 0)
- **Vanilla JS** — 빌드 시스템 없음, 단일 HTML + JS

## 📄 라이선스

MIT — 자유롭게 수정·배포하세요.

---

🤖 Made with [Claude Code](https://claude.com/claude-code)
