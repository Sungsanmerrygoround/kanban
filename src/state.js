// Application state, persistence, sample data, and lookup helpers.

import { writeUserState } from './sync.js';
import { uid } from './utils.js';

// Virtual project id for the cross-project "전체" aggregate board.
export const ALL_PROJECT_ID = '__all__';
export function isAllView() { return state.activeProjectId === ALL_PROJECT_ID; }

// Smart views (today dashboard / saved filters) live behind this namespace in
// activeProjectId, e.g. '__view__:today' or '__view__:<savedId>'.
export const VIEW_PREFIX = '__view__:';
export function isViewActive() {
  return typeof state.activeProjectId === 'string'
    && state.activeProjectId.startsWith(VIEW_PREFIX);
}
export function activeViewId() {
  return isViewActive() ? state.activeProjectId.slice(VIEW_PREFIX.length) : null;
}

// Built-in smart views (always available). Saved views are user-defined.
export const BUILTIN_VIEWS = [
  { id: 'today',   name: '오늘',    icon: '📅' },
  { id: 'week',    name: '이번 주', icon: '🗓️' },
  { id: 'overdue', name: '지연됨',  icon: '⚠️' },
];
export function viewName(id) {
  const b = BUILTIN_VIEWS.find(v => v.id === id);
  if (b) return b.name;
  const sv = (state.savedViews || []).find(v => v.id === id);
  return sv ? sv.name : '뷰';
}

// Standard column set every project is unified to.
export const STD_COLUMNS = ['할 일', '진행 중', '완료'];

// Stamp a card's last-edited time (drives the "최근 편집" dashboard section).
export function touchCard(card) { if (card) card.updatedAt = Date.now(); }

// Unique per browser tab — used to ignore our own snapshot echoes.
export const clientId = (crypto.randomUUID && crypto.randomUUID()) ||
  ('c-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

const V = 'kb6';
const KEY_STATE = `${V}_state`;
const KEY_TAGS  = `${V}_tcm`;
const KEY_TIDX  = `${V}_tci`;

// ── Constants ───────────────────────────────────────────────────────────────
const TAG_PALETTE = ['purple','blue','green','red','yellow','pink','cyan','orange','gray'];

export const COL_COLORS = [
  '#10a37f','#84cc16','#0d9488','#22c55e',
  '#16a34a','#65a30d','#14b8a6','#059669',
];

// ── Project colour palette (calendar uses this) ─────────────────────────────
export const PROJECT_HUES = [216, 340, 152, 38, 268, 22, 188, 56];
export function projectHue(projectId) {
  const idx = state.projects.findIndex(p => p.id === projectId);
  return PROJECT_HUES[(idx < 0 ? 0 : idx) % PROJECT_HUES.length];
}

// ── Sample data ─────────────────────────────────────────────────────────────
const SAMPLE_STATE = {
  activeProjectId: 'p1',
  schemaVersion: 1,
  projects: [
    {
      id: 'p1', name: '제품 개발',
      columns: [
        {
          id: 'c0', title: '할 일', color: '#10a37f',
          cards: [
            { id:'k1', title:'랜딩 페이지 디자인 시안 3종', desc:'Figma로 라이트/다크/미니멀 옵션 제작 후 팀 리뷰', priority:'high', tags:['디자인','Figma'], due:'2026-05-17' },
            { id:'k2', title:'REST API 인증 로직 리팩토링', desc:'JWT 갱신 흐름 개선 및 에러 핸들링 표준화', priority:'medium', tags:['백엔드','보안'], due:'2026-05-19' },
            { id:'k3', title:'Q3 마케팅 캘린더 초안 작성', desc:'', priority:'low', tags:['마케팅'], due:'2026-05-22' },
            { id:'k4', title:'팀 온보딩 문서 최신화', desc:'신규 입사자 체크리스트 포함', priority:'none', tags:['문서'], due:'' },
          ],
        },
        {
          id: 'c1', title: '진행 중', color: '#84cc16',
          cards: [
            { id:'k5', title:'대시보드 번들 최적화', desc:'코드 스플리팅 + lazy import 적용, 번들 -40% 목표', priority:'high', tags:['프론트엔드','성능'], due:'2026-05-14' },
            { id:'k6', title:'B2B 고객 인터뷰 5건', desc:'UX 리서치 — 화면 녹화 동의 필요', priority:'medium', tags:['리서치','UX'], due:'2026-05-21' },
          ],
        },
        {
          id: 'c2', title: '완료', color: '#0d9488',
          cards: [
            { id:'k7', title:'데이터베이스 스키마 설계', desc:'users, sessions, events 테이블 확정', priority:'high', tags:['DB','백엔드'], due:'' },
            { id:'k8', title:'스테이징 환경 구축', desc:'Docker + GitHub Actions CI/CD 파이프라인 완성', priority:'medium', tags:['DevOps'], due:'' },
            { id:'k9', title:'Q2 OKR 문서 완성', desc:'', priority:'none', tags:['기획'], due:'' },
          ],
        },
      ],
    },
    {
      id: 'p2', name: '마케팅 캠페인',
      columns: [
        {
          id: 'c3', title: '할 일', color: '#10a37f',
          cards: [
            { id:'m1', title:'인스타그램 릴스 시리즈 기획', desc:'주 2회 업로드, 8주 콘텐츠 캘린더', priority:'medium', tags:['SNS','콘텐츠'], due:'2026-05-20' },
            { id:'m2', title:'인플루언서 협업 후보 리서치', desc:'팔로워 5만+ 라이프스타일 분야', priority:'low', tags:['리서치'], due:'' },
          ],
        },
        {
          id: 'c4', title: '진행 중', color: '#84cc16',
          cards: [
            { id:'m3', title:'런칭 이벤트 랜딩 페이지', desc:'개발팀 협업 — 5/22 오픈 예정', priority:'high', tags:['웹','이벤트'], due:'2026-05-18' },
            { id:'m4', title:'홍보 영상 1차 편집본 리뷰', desc:'', priority:'medium', tags:['영상'], due:'2026-05-24' },
          ],
        },
        {
          id: 'c5', title: '완료', color: '#0d9488',
          cards: [
            { id:'m5', title:'5월 뉴스레터 발송', desc:'A/B 테스트 결과 분석 포함', priority:'medium', tags:['이메일'], due:'' },
          ],
        },
      ],
    },
    {
      id: 'p3', name: '운영 & 지원',
      columns: [
        {
          id: 'c6', title: '할 일', color: '#10a37f',
          cards: [
            { id:'o1', title:'고객 문의 자동 분류 시스템 도입', desc:'문의 카테고리별 라우팅', priority:'medium', tags:['CS','자동화'], due:'' },
            { id:'o2', title:'결제 실패 케이스 대응 매뉴얼', desc:'카드사별 에러 코드 정리', priority:'high', tags:['결제'], due:'2026-05-17' },
          ],
        },
        {
          id: 'c7', title: '진행 중', color: '#84cc16',
          cards: [
            { id:'o3', title:'프로덕션 알림 채널 분리', desc:'critical / warning / info 분리', priority:'medium', tags:['인프라','알림'], due:'2026-05-19' },
          ],
        },
        {
          id: 'c8', title: '완료', color: '#0d9488',
          cards: [
            { id:'o4', title:'서버 메모리 누수 이슈 해결', desc:'Node.js heap 분석 완료', priority:'high', tags:['인프라'], due:'' },
            { id:'o5', title:'로그인 이중 인증 안정화', desc:'', priority:'medium', tags:['보안'], due:'' },
          ],
        },
      ],
    },
  ],
};

// ── State ───────────────────────────────────────────────────────────────────
export let state = structuredClone(SAMPLE_STATE);
const tagColorMap = {};
let tagIdx = 0;

export const filter = { query: '', tags: [], priorities: [], due: null, projectId: null };

// True when an ad-hoc filter (priority/tag/due chips) is active — drives the
// transient "필터 결과" dashboard, independent of the active project/view.
export function hasAdHocFilter() {
  return !!(filter.due || filter.priorities.length || filter.tags.length);
}

// ── Undo / Redo ──────────────────────────────────────────────────────────────
const MAX_UNDO = 50;
const _undoStack = [];
const _redoStack = [];

function _snap() {
  return {
    state: structuredClone(state),
    tagColorMap: { ...tagColorMap },
    tagIdx,
  };
}

export function pushUndo() {
  _redoStack.length = 0;
  _undoStack.push(_snap());
  if (_undoStack.length > MAX_UNDO) _undoStack.shift();
}

export function undo() {
  if (!_undoStack.length) return false;
  _redoStack.push(_snap());
  const prev = _undoStack.pop();
  state = prev.state;
  Object.keys(tagColorMap).forEach(k => delete tagColorMap[k]);
  Object.assign(tagColorMap, prev.tagColorMap);
  tagIdx = prev.tagIdx;
  save();   // sync the revert to the cloud too (no-op push when offline/local build)
  return true;
}

export function redo() {
  if (!_redoStack.length) return false;
  _undoStack.push(_snap());
  const next = _redoStack.pop();
  state = next.state;
  Object.keys(tagColorMap).forEach(k => delete tagColorMap[k]);
  Object.assign(tagColorMap, next.tagColorMap);
  tagIdx = next.tagIdx;
  save();   // sync the revert to the cloud too (no-op push when offline/local build)
  return true;
}

// ── Auth-scoped persistence ────────────────────────────────────────────────
let currentUid = null;
let pushTimer = null;

export function setUser(uid) { currentUid = uid; }

function loadLocal() {
  try {
    const s = localStorage.getItem(KEY_STATE);
    if (s) state = JSON.parse(s);
    const tc = localStorage.getItem(KEY_TAGS);
    if (tc) Object.assign(tagColorMap, JSON.parse(tc));
    const ti = localStorage.getItem(KEY_TIDX);
    if (ti) tagIdx = parseInt(ti, 10) || 0;
  } catch (e) { /* ignore corrupt storage */ }
}

function applyShapeGuards() {
  if (!state || !Array.isArray(state.projects) || state.projects.length === 0) {
    state = structuredClone(SAMPLE_STATE);
  }
  // One-time migration: unify every project's columns to 할 일 / 진행 중 / 완료.
  // Runs once per dataset (guarded by schemaVersion) so later user-added columns
  // (e.g. "기타") survive subsequent loads.
  if (!state.schemaVersion) {
    state.projects.forEach(migrateProjectColumns);
    state.schemaVersion = 1;
  }
  // Keep virtual selections ("전체" / smart views); otherwise fall back to a
  // real project. A custom saved view whose id no longer exists also falls back.
  const ap = state.activeProjectId;
  const isAll = ap === ALL_PROJECT_ID;
  const isView = typeof ap === 'string' && ap.startsWith(VIEW_PREFIX);
  const viewOk = isView && (() => {
    const id = ap.slice(VIEW_PREFIX.length);
    return BUILTIN_VIEWS.some(v => v.id === id)
      || (state.savedViews || []).some(v => v.id === id);
  })();
  if (!isAll && !viewOk &&
      (!ap || isView || !state.projects.find(p => p.id === ap))) {
    state.activeProjectId = state.projects[0].id;
  }
  if (!Array.isArray(state.templates)) state.templates = [];
  if (!Array.isArray(state.savedViews)) state.savedViews = [];
}

// Rebuild a project's columns into exactly [할 일, 진행 중, 완료], bucketing the
// existing columns by position (first → 할 일, last → 완료, middle → 진행 중) and
// concatenating their cards in order. Idempotent: a project already in standard
// shape is left untouched.
function migrateProjectColumns(project) {
  const cols = project.columns || [];
  const isStandard = cols.length === 3 &&
    cols.every((c, i) => c.title === STD_COLUMNS[i]);
  if (isStandard) return;

  const n = cols.length;
  const buckets = [[], [], []];
  cols.forEach((c, i) => {
    const b = n <= 1 ? 0 : (i === 0 ? 0 : i === n - 1 ? 2 : 1);
    buckets[b].push(...(c.cards || []));
  });
  project.columns = STD_COLUMNS.map((title, i) => ({
    id: uid(),
    title,
    color: COL_COLORS[i],
    cards: buckets[i],
  }));
}

function saveLocal() {
  localStorage.setItem(KEY_STATE, JSON.stringify(state));
  localStorage.setItem(KEY_TAGS, JSON.stringify(tagColorMap));
  localStorage.setItem(KEY_TIDX, String(tagIdx));
}

// Public save: synchronous local write + debounced cloud push.
export function save() {
  saveLocal();
  if (!currentUid) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    writeUserState(currentUid, {
      state,
      tagColorMap,
      tagIdx,
      writerId: clientId,
    }).catch(err => console.error('Cloud save failed:', err));
  }, 500);
}

// Synchronous load from localStorage — cloud sync arrives via subscription.
export function load() {
  loadLocal();
  applyShapeGuards();
}

// ── Import / Export helpers ──────────────────────────────────────────────────
// Returns a plain-object snapshot safe to JSON-serialise.
export function exportData() {
  return {
    state: structuredClone(state),
    tagColorMap: { ...tagColorMap },
    tagIdx,
  };
}

// Replaces live state from a plain-object snapshot (e.g. loaded from JSON).
export function importData(data) {
  if (!data || !data.state) throw new Error('state 키가 없습니다');
  state = data.state;
  Object.keys(tagColorMap).forEach(k => delete tagColorMap[k]);
  Object.assign(tagColorMap, data.tagColorMap || {});
  tagIdx = data.tagIdx || 0;
  applyShapeGuards();
  saveLocal();
}

// Apply a snapshot received from Firestore. Ignores echoes of our own writes.
// Returns true if state actually changed.
export function applyRemote(data) {
  if (!data || !data.state) return false;
  if (data.writerId === clientId) return false; // our own echo

  state = data.state;
  Object.keys(tagColorMap).forEach(k => delete tagColorMap[k]);
  Object.assign(tagColorMap, data.tagColorMap || {});
  tagIdx = data.tagIdx || 0;
  applyShapeGuards();
  saveLocal();
  return true;
}

// ── Tag colors ──────────────────────────────────────────────────────────────
export function tagColor(tag) {
  if (!tagColorMap[tag]) {
    tagColorMap[tag] = TAG_PALETTE[(tagIdx++) % TAG_PALETTE.length];
  }
  return tagColorMap[tag];
}

// ── Lookups ─────────────────────────────────────────────────────────────────
export function activeProject() {
  return state.projects.find(p => p.id === state.activeProjectId) || state.projects[0];
}
export function activeColumns() { return activeProject().columns; }
export function getColById(id)  { return activeColumns().find(c => c.id === id); }
export function findCard(cardId) {
  for (const col of activeColumns()) {
    const card = col.cards.find(c => c.id === cardId);
    if (card) return { card, col };
  }
  return null;
}

// Cross-project lookup — used by global search.
export function findCardAnywhere(cardId) {
  for (const p of state.projects) {
    for (const col of p.columns) {
      const card = col.cards.find(c => c.id === cardId);
      if (card) return { card, col, project: p };
    }
  }
  return null;
}

export function setActiveProject(id) {
  if (state.projects.find(p => p.id === id)) state.activeProjectId = id;
}

// ── Search filter ───────────────────────────────────────────────────────────
export function matchesSearch(card) {
  if (!filter.query) return true;
  const q = filter.query.toLowerCase();
  return card.title.toLowerCase().includes(q) ||
    (card.desc || '').toLowerCase().includes(q) ||
    card.tags.some(t => t.toLowerCase().includes(q));
}
