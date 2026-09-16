export function getGlobalSearchHtml(): string {
  return `
    <div class="modal-backdrop" id="globalSearchBackdrop" onclick="closeGlobalSearch(event)">
      <div class="search-dialog-window" onclick="event.stopPropagation()">
        <div class="search-dialog-input-row">
          <span style="font-size: 16px; color: var(--text-muted);">🔍</span>
          <input type="text" id="globalSearchInput" class="search-dialog-input" placeholder="Buscar clientes, sedes, equipos, IP, alertas..." oninput="handleGlobalSearchInput(this.value)" autocomplete="off">
          <span class="kbd-shortcut" style="cursor: pointer;" onclick="closeGlobalSearch()">ESC</span>
        </div>

        <div class="search-results-list" id="globalSearchResults">
          <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">
            Escribí para buscar en tiempo real clientes, equipos o alertas...
          </div>
        </div>
      </div>
    </div>
  `;
}
