# 🚀 GitHub에 올려서 친구한테 공유하기

이 게임을 GitHub Pages로 공개해서 누구나 URL로 플레이할 수 있게 만드는 가이드.

---

## ✅ 이미 준비된 것

이 폴더(`cbti-3d-game/`)는 이미 독립된 git 저장소예요. 첫 커밋도 되어있습니다:

```bash
$ git log --oneline
c47c647 (HEAD -> main) Initial release: CBTI 3D ...
```

남은 건 **GitHub에 빈 레포 만들고 → push → Pages 켜기** 3단계.

---

## 1️⃣ GitHub에서 빈 레포 만들기

1. https://github.com/new 접속
2. 다음과 같이 입력:
   - **Repository name**: `cbti-3d-game` (다른 이름이어도 됨, 아래 URL이 그에 맞춰 바뀜)
   - **Public** 선택 (Pages는 public이어야 무료)
   - **README, .gitignore, license 추가하지 말기** (이미 로컬에 있어서 충돌남)
3. **Create repository** 클릭

생성 후 나오는 화면 그대로 두고 다음 단계로.

---

## 2️⃣ 로컬 → GitHub 푸시

이 폴더(`/workshop/cbti-3d-game`) 안에서 터미널을 열고:

```bash
git remote add origin https://github.com/jungkunkim-glitch/cbti-3d-game.git
git branch -M main
git push -u origin main
```

> ⚠️ 다른 레포 이름으로 만들었다면 `cbti-3d-game.git` 부분을 바꿔주세요.

`username` / `password` 물어보면:
- username: `jungkunkim-glitch`
- password: **GitHub 비밀번호 X** → **Personal Access Token** 입력
  - 토큰 발급: https://github.com/settings/tokens → "Generate new token (classic)"
  - Scope: `repo` 체크
  - 발급된 토큰을 password 자리에 붙여넣기

---

## 3️⃣ GitHub Pages 켜기

푸시가 끝나면:

1. 방금 만든 레포 페이지로 이동: `https://github.com/jungkunkim-glitch/cbti-3d-game`
2. 상단 **Settings** 탭 클릭
3. 좌측 사이드바 **Pages** 클릭
4. **Source** 섹션:
   - Branch: **main**
   - Folder: **/ (root)**
   - **Save** 클릭
5. 1~2분 기다리기. 페이지 상단에 초록 박스로 URL이 뜸:

```
✅ Your site is live at https://jungkunkim-glitch.github.io/cbti-3d-game/
```

이 URL을 공유하면 누구나 브라우저에서 바로 플레이 가능합니다 📱💻

---

## 📝 나중에 게임 업데이트할 때

```bash
# 코드 수정 후
git add .
git commit -m "fix: 무엇을 고쳤는지"
git push
```

push하고 1~2분이면 Pages도 자동 업데이트.

---

## 🎯 트러블슈팅

### Push 시 "Permission denied" / 401
→ Personal Access Token이 필요해요. 위 2단계 참고.

### Pages가 404
→ Settings → Pages 다시 확인. Branch가 `main`이고 Folder가 `/ (root)`인지.
→ 첫 배포는 1~2분 걸려요. 새로고침 해보세요.

### 사운드가 안 나옴
→ 모바일 브라우저는 첫 사용자 인터랙션 후에만 오디오 재생 가능.
   "지금 시작하기" 버튼 누르면 그때 오디오가 활성화됩니다.

### 레이스가 검은 화면
→ Three.js CDN 로드 실패 가능성. 브라우저 개발자 도구 콘솔(F12)에 빨간 에러가 뜨는지 확인.
