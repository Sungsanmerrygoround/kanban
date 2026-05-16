# Kanban Board

폰에서도 볼 수 있는 정적 웹앱. Firebase Auth + Firestore로 로그인한 계정 단위로 보드를 동기화합니다.

## 1. Firebase 셋업 (한 번만)

1. <https://console.firebase.google.com/> 에서 **Add project** → 이름 입력 → Analytics는 꺼도 됨.
2. **Authentication** 메뉴 → **Get started** → **Sign-in method** → **Email/Password** **Enable** → Save.
3. **Firestore Database** 메뉴 → **Create database** → Location 선택 → **Start in production mode**.
4. **Rules** 탭에서 아래로 교체하고 **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

5. **Project settings (톱니바퀴)** → **General** → **Your apps** → **`</>`(Web)** 추가 → 닉네임 입력 → Register.
6. 보여주는 `firebaseConfig` 객체의 값들을 복사해서 `src/firebase-config.js`의 `REPLACE_ME`들에 붙여넣기.
7. **Authentication → Settings → Authorized domains**에 GitHub Pages 주소(예: `<your-username>.github.io`)를 추가.

## 2. 로컬 테스트

브라우저는 ES module을 `file://`에서 막으니까 정적 서버가 필요합니다.

```bash
npx serve . -p 3131
```

브라우저로 <http://localhost:3131> 접속 → 가입 → 카드 만들고 다른 브라우저/창에서 로그인해서 동기화 확인.

## 3. GitHub Pages 배포

```bash
# kanban 폴더 안에서
git init
git add .
git commit -m "Kanban board with Firebase sync"
gh repo create kanban --public --source . --push
```

`gh`가 없으면 GitHub에서 빈 리포 만들고:

```bash
git remote add origin https://github.com/<you>/kanban.git
git branch -M main
git push -u origin main
```

그 다음 GitHub 리포 → **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)`** → Save.

1~2분 뒤 `https://<you>.github.io/kanban/` 에 접속됩니다. **Firebase 콘솔의 Authorized domains에 이 도메인을 추가하는 것 잊지 마세요.**

폰 홈 화면에 추가하면 PWA처럼 쓸 수 있습니다.

## 데이터 모델

```
users/{uid}
  ├ state: { activeProjectId, projects: [...] }
  ├ tagColorMap: { 태그명: 색상키 }
  ├ tagIdx: 다음 태그 색상 인덱스
  └ updatedAt: 서버 타임스탬프
```

저장 전략: 로컬은 즉시 반영, Firestore는 500ms debounce. 오프라인이면 로컬만 갱신되고 다시 온라인되면 다음 변경 때 푸시됩니다.

## 파일 구조

| 파일 | 역할 |
| --- | --- |
| `index.html` | 마크업 (사이드바, 보드, 모달, auth 오버레이) |
| `styles.css` | 전체 스타일 |
| `src/main.js` | 진입점, 이벤트 와이어링, auth gate |
| `src/firebase.js` | Firebase 초기화 |
| `src/firebase-config.js` | 사용자가 채우는 config |
| `src/auth.js` | 로그인/가입 UI |
| `src/sync.js` | Firestore CRUD |
| `src/state.js` | 상태, 영속화, 룩업 |
| `src/board.js` | 컬럼 렌더링/CRUD |
| `src/cards.js` | 카드 + 드래그앤드롭 |
| `src/sidebar.js` | 프로젝트 트리 |
| `src/modal.js` | 카드 편집 모달 |
| `src/refresh.js` | 렌더 코디네이터 |
| `src/utils.js` | 순수 헬퍼 |
