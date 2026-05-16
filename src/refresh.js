// Render coordinator. Lives alone to avoid circular imports between
// action modules (sidebar/board/cards/modal) and the UI modules.

import { renderSidebar, renderNavbarTitle } from './sidebar.js';
import { renderBoard } from './board.js';

export function refreshAll() {
  renderSidebar();
  renderNavbarTitle();
  renderBoard();
}
