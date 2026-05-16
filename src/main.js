// Application entry point — wires global events, gates load on auth.

import { load, filter, setUser } from './state.js';
import { refreshAll } from './refresh.js';
import { addProject } from './sidebar.js';
import { addColumn, renderBoard } from './board.js';
import { initModal, closeModal } from './modal.js';
import { initAuth, onUserChange } from './auth.js';

// ── Wire global events ──────────────────────────────────────────────────────
document.getElementById('addColNavBtn').addEventListener('click', addColumn);
document.getElementById('addProjectBtn').addEventListener('click', addProject);

document.getElementById('searchInput').addEventListener('input', e => {
  filter.query = e.target.value;
  renderBoard();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

initModal();
initAuth();

// ── Auth-gated init ─────────────────────────────────────────────────────────
onUserChange(async (user) => {
  if (user) {
    setUser(user.uid);
    await load();
    refreshAll();
  } else {
    setUser(null);
    // Clear the board behind the auth overlay
    document.getElementById('board').innerHTML = '';
    document.getElementById('projectList').innerHTML = '';
  }
});
