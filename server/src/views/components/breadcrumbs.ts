export function getBreadcrumbsHtml(): string {
  return `
    <div class="app-breadcrumbs-bar">
      <div class="breadcrumbs-trail" id="breadcrumbsTrail">
        <span class="breadcrumb-link" onclick="switchNavTab('dashboard')">NOC</span>
        <span class="breadcrumb-separator">/</span>
        <span class="breadcrumb-active" id="breadcrumbActiveText">Dashboard</span>
      </div>

      <div id="breadcrumbsActions" style="display: flex; align-items: center; gap: 8px;">
        <!-- Contextual actions rendered dynamically -->
      </div>
    </div>
  `;
}
