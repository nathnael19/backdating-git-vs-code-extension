import * as vscode from "vscode";

export function getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  const localISOTime = new Date(now.getTime() - tzOffset)
    .toISOString()
    .slice(0, 16);

  const codiconsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      extensionUri,
      "node_modules",
      "@vscode/codicons",
      "dist",
      "codicon.css",
    ),
  );

  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="${codiconsUri}" rel="stylesheet" />
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');

        :root {
          --bg-oled: #05070A;
          --glass-bg: rgba(255, 255, 255, 0.03);
          --glass-border: rgba(255, 255, 255, 0.08);
          --accent: #C5A028;
          --accent-glow: rgba(197, 160, 40, 0.15);
          --success: #22C55E;
          --text-primary: #F8FAFC;
          --text-secondary: #94A3B8;
          --input-bg: rgba(0, 0, 0, 0.2);
          
          --mod-fg: #E2C08D;
          --add-fg: #81B88B;
          --del-fg: #C74E39;
          --unt-fg: #73C991;

          --transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        body {
          font-family: 'DM Sans', var(--vscode-font-family), sans-serif;
          color: var(--text-primary);
          background-color: var(--bg-oled);
          background-image: 
            radial-gradient(circle at top right, rgba(197, 160, 40, 0.05), transparent 400px),
            radial-gradient(circle at bottom left, rgba(34, 197, 94, 0.03), transparent 400px);
          padding: 14px;
          font-size: 13px;
          line-height: 1.6;
          overflow-x: hidden;
          margin: 0;
        }

        .container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          animation: fadeIn 0.4s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .glass-card {
          background: var(--glass-bg);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--glass-border);
          border-radius: 12px;
          padding: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          transition: var(--transition);
        }

        .glass-card:hover {
          border-color: rgba(197, 160, 40, 0.2);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        h3 {
          margin: 0;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 700;
          color: var(--text-secondary);
        }

        .header-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.04);
          padding: 4px 10px;
          border-radius: 20px;
          border: 1px solid var(--glass-border);
        }

        .repo-info {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
          padding: 0 4px;
        }

        .repo-path {
          font-size: 11px;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 60%;
        }

        .branch-tag {
          font-size: 10px;
          font-weight: 600;
          color: var(--accent);
          background: var(--accent-glow);
          padding: 2px 8px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        textarea, input[type="datetime-local"] { 
          width: 100%; 
          box-sizing: border-box; 
          background: var(--input-bg); 
          color: var(--text-primary); 
          border: 1px solid var(--glass-border); 
          border-radius: 8px; 
          padding: 10px; 
          font-family: inherit; 
          font-size: 13px;
          transition: var(--transition);
        }

        textarea:focus, input:focus { 
          outline: none; 
          border-color: var(--accent);
          background: rgba(255, 255, 255, 0.05);
          box-shadow: 0 0 0 3px var(--accent-glow);
        }

        textarea { min-height: 80px; resize: none; }

        .btn-group {
          display: flex;
          gap: 8px;
          margin-top: 4px;
        }

        .btn {
          cursor: pointer;
          border: none;
          border-radius: 8px;
          padding: 10px 16px;
          font-weight: 600;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: var(--transition);
          font-family: inherit;
        }

        .btn-primary {
          background: linear-gradient(135deg, var(--accent), #9A7B1D);
          color: white;
          box-shadow: 0 4px 15px rgba(197, 160, 40, 0.3);
        }
        
        /* Only stretch primary buttons when in a group */
        .btn-group .btn-primary {
          flex: 1;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(197, 160, 40, 0.4);
        }

        .btn-primary:active { transform: translateY(0); }

        .btn-primary:disabled {
          background: var(--glass-border);
          color: var(--text-secondary);
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .btn-outline {
          background: transparent;
          border: 1px solid var(--accent);
          color: var(--accent);
          padding: 8px;
        }

        .btn-outline:hover {
          background: var(--accent-glow);
        }

        .action-icon {
          cursor: pointer;
          opacity: 0.6;
          transition: var(--transition);
          padding: 4px;
          border-radius: 4px;
        }

        .action-icon:hover {
          opacity: 1;
          background: rgba(255, 255, 255, 0.1);
          color: var(--accent);
        }

        .presets {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 4px;
          margin-bottom: 12px;
          scrollbar-width: none;
        }

        .presets::-webkit-scrollbar { display: none; }

        .preset-chip {
          white-space: nowrap;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--glass-border);
          color: var(--text-secondary);
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          cursor: pointer;
          transition: var(--transition);
        }

        .preset-chip:hover {
          background: var(--accent-glow);
          border-color: var(--accent);
          color: var(--accent);
        }

        .switch-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 10px;
          padding: 4px;
        }

        .switch {
          position: relative;
          display: inline-block;
          width: 34px;
          height: 18px;
        }

        .switch input { opacity: 0; width: 0; height: 0; }

        .slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: rgba(255, 255, 255, 0.1);
          transition: .4s;
          border-radius: 18px;
        }

        .slider:before {
          position: absolute;
          content: "";
          height: 14px; width: 14px;
          left: 2px; bottom: 2px;
          background-color: white;
          transition: .4s;
          border-radius: 50%;
        }

        input:checked + .slider { background-color: var(--success); }
        input:checked + .slider:before { transform: translateX(16px); }

        .file-item {
          display: flex;
          align-items: center;
          padding: 6px 8px;
          border-radius: 8px;
          gap: 10px;
          cursor: pointer;
          transition: var(--transition);
        }

        .file-item:hover {
          background: rgba(255, 255, 255, 0.04);
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .S-M, .U-M { background-color: var(--mod-fg); box-shadow: 0 0 8px var(--mod-fg); }
        .S-A, .U-A { background-color: var(--add-fg); box-shadow: 0 0 8px var(--add-fg); }
        .S-D, .U-D { background-color: var(--del-fg); box-shadow: 0 0 8px var(--del-fg); }
        .S-?, .U-? { background-color: var(--unt-fg); box-shadow: 0 0 8px var(--unt-fg); }

        .file-info {
          flex: 1;
          min-width: 0;
        }

        .file-name {
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: block;
        }

        .file-actions {
          display: flex;
          gap: 4px;
          opacity: 0;
          transition: var(--transition);
        }

        .file-item:hover .file-actions { opacity: 1; }

        .history-item {
          padding: 8px;
          border-bottom: 1px solid var(--glass-border);
          font-size: 11px;
        }

        .history-item:last-child { border-bottom: none; }

        .history-hash {
          color: var(--accent);
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
          margin-right: 6px;
        }

        .history-meta {
          display: block;
          font-size: 10px;
          color: var(--text-secondary);
          margin-top: 2px;
        }

        .empty-state {
          text-align: center;
          padding: 20px 10px;
          color: var(--text-secondary);
          font-size: 11px;
          font-style: italic;
        }

        .hidden { display: none; }

        .no-repo-view {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 80vh;
          text-align: center;
          padding: 24px;
          gap: 16px;
        }

        .no-repo-icon {
          font-size: 48px;
          color: var(--text-secondary);
          opacity: 0.3;
        }
      </style>
    </head>
    <body>
      <div id="main-view" class="container">
        <div class="repo-info">
          <div class="repo-path" id="currentRepo">Discovering...</div>
          <div id="branchPill" class="branch-tag hidden">
            <span class="codicon codicon-git-branch"></span>
            <span id="currentBranchName"></span>
          </div>
        </div>

        <div class="glass-card">
          <div class="section-header">
            <div class="header-pill">
              <h3>Staged Changes</h3>
            </div>
            <span class="action-icon codicon codicon-remove-all" title="Unstage All" onclick="unstageAll()"></span>
          </div>
          <div id="staged-files"></div>
          
          <div class="section-header" style="margin-top: 16px;">
            <div class="header-pill">
              <h3>Unstaged Changes</h3>
            </div>
            <div style="display: flex; gap: 8px;">
              <span class="action-icon codicon codicon-discard" title="Discard All" onclick="discardAll()"></span>
              <span class="action-icon codicon codicon-add" title="Stage All" onclick="stageAll()"></span>
            </div>
          </div>
          <div id="unstaged-files"></div>
        </div>

        <div class="glass-card">
          <div class="header-pill" style="margin-bottom: 12px; width: fit-content;">
            <h3>Commit Details</h3>
          </div>
          <textarea id="msg" placeholder="Summarize your changes..."></textarea>
          
          <div class="presets">
            <div class="preset-chip" onclick="setPreset(1)">Yesterday</div>
            <div class="preset-chip" onclick="setPreset(7)">1 week ago</div>
            <div class="preset-chip" onclick="setPreset(30)">1 month ago</div>
            <div class="preset-chip" onclick="setPreset(365)">1 year ago</div>
          </div>

          <div style="margin-bottom: 8px;">
            <label style="font-size: 10px; color: var(--text-secondary); margin-left: 4px; display: block; margin-bottom: 4px;">Author Date</label>
            <input type="datetime-local" id="authorDate" value="${localISOTime}">
          </div>

          <div id="committerDateGroup" class="hidden" style="margin-bottom: 8px;">
            <label style="font-size: 10px; color: var(--text-secondary); margin-left: 4px; display: block; margin-bottom: 4px;">Committer Date</label>
            <input type="datetime-local" id="committerDate" value="${localISOTime}">
          </div>

          <div class="switch-container">
            <span style="font-size: 11px; color: var(--text-secondary);">Sync Committer Date</span>
            <label class="switch">
              <input type="checkbox" id="syncDate" checked onchange="toggleCommitter()">
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <div class="btn-group">
          <button class="btn btn-primary" id="commitButton" onclick="doCommit()">
            <span class="codicon codicon-check"></span>
            Backdate Commit
          </button>
          <button class="btn btn-outline" title="Push to Remote" onclick="pushToRemote()">
            <span class="codicon codicon-cloud-upload"></span>
          </button>
        </div>

        <div class="glass-card">
          <div class="section-header">
            <div class="header-pill">
              <h3>Recent Timeline</h3>
            </div>
            <span class="action-icon codicon codicon-refresh" title="Refresh" onclick="refreshStatus()"></span>
          </div>
          <div id="historyList"></div>
        </div>
      </div>

      <div id="no-repo-view" class="no-repo-view hidden">
        <span class="no-repo-icon codicon codicon-source-control"></span>
        <div style="font-weight: 700; font-size: 16px;">No Repository Found</div>
        <div style="color: var(--text-secondary); font-size: 12px;">Open a file from a Git repository to enable backdating features.</div>
        <button class="btn btn-primary" style="margin-top: 8px;" onclick="refreshStatus()">Retry Discovery</button>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        const commitButton = document.getElementById('commitButton');
        const commitMessageInput = document.getElementById('msg');

        function escapeHtml(text) {
          if (!text) return "";
          const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
          };
          return text.replace(/[&<>"']/g, function(m) { return map[m]; });
        }

        function updateCommitButtonState(hasChanges) {
          const msg = commitMessageInput.value.trim();
          commitButton.disabled = !msg || !hasChanges;
        }
        
        function toggleCommitter() {
          const sync = document.getElementById('syncDate').checked;
          document.getElementById('committerDateGroup').classList.toggle('hidden', sync);
        }

        function setPreset(days) {
          const date = new Date();
          date.setDate(date.getDate() - days);
          const tzOffset = date.getTimezoneOffset() * 60000;
          const formatted = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
          document.getElementById('authorDate').value = formatted;
          document.getElementById('committerDate').value = formatted;
        }

        function stage(file) { vscode.postMessage({ type: 'stage', file }); }
        function unstage(file) { vscode.postMessage({ type: 'unstage', file }); }
        function discard(file, status) { vscode.postMessage({ type: 'discard', file, status }); }
        function stageAll() { vscode.postMessage({ type: 'stageAll' }); }
        function unstageAll() { vscode.postMessage({ type: 'unstageAll' }); }
        function discardAll() { vscode.postMessage({ type: 'discardAll' }); }
        function openFile(file) { vscode.postMessage({ type: 'openFile', file }); }
        function pushToRemote() { vscode.postMessage({ type: 'push' }); }
        function refreshStatus() { vscode.postMessage({ type: 'refresh' }); }

        function doCommit() {
          const msg = commitMessageInput.value.trim();
          const authorDate = document.getElementById('authorDate').value.replace('T', ' ') + ':00';
          const sync = document.getElementById('syncDate').checked;
          const committerDate = sync ? authorDate : document.getElementById('committerDate').value.replace('T', ' ') + ':00';
          if(!msg) return;
          vscode.postMessage({ type: 'commit', message: msg, authorDate, committerDate });
          commitMessageInput.value = '';
          updateCommitButtonState(false);
        }

        window.addEventListener('message', event => {
          const data = event.data;
          const mainView = document.getElementById('main-view');
          const noRepoView = document.getElementById('no-repo-view');

          if (data.type === 'no-repo') {
            mainView.classList.add('hidden');
            noRepoView.classList.remove('hidden');
            return;
          }

          if (data.type === 'update') {
            mainView.classList.remove('hidden');
            noRepoView.classList.add('hidden');
            document.getElementById('currentRepo').textContent = data.root;

            const branchPill = document.getElementById('branchPill');
            const branchNameEl = document.getElementById('currentBranchName');
            if (data.branch) {
              branchNameEl.textContent = data.branch;
              branchPill.classList.remove('hidden');
            } else {
              branchPill.classList.add('hidden');
            }

            const { history, status } = data;
            const stagedEl = document.getElementById('staged-files');
            const unstagedEl = document.getElementById('unstaged-files');
            
            const staged = status.filter(s => s.staged !== ' ' && s.staged !== '?');
            const unstaged = status.filter(s => s.unstaged !== ' ' || s.staged === '?');

            stagedEl.innerHTML = staged.length ? staged.map(s => renderFileItem(s, true)).join('') : '<div class="empty-state">Nothing staged</div>';
            unstagedEl.innerHTML = unstaged.length ? unstaged.map(s => renderFileItem(s, false)).join('') : '<div class="empty-state">No changes</div>';

            const histList = document.getElementById('historyList');
            histList.innerHTML = history.length > 0 ? history.map(h => {
              const parts = h.split(' - ');
              const hash = parts[0];
              const rest = parts.slice(1).join(' - ');
              const metaMatch = rest.match(/\\(([^)]+)\\)$/);
              const meta = metaMatch ? metaMatch[1] : '';
              const msg = metaMatch ? rest.replace(metaMatch[0], '').trim() : rest;
              
              return '<div class="history-item">' +
                '<div><span class="history-hash">' + escapeHtml(hash) + '</span>' + escapeHtml(msg) + '</div>' +
                '<span class="history-meta">' + escapeHtml(meta) + '</span>' +
              '</div>';
            }).join('') : '<div class="empty-state">Timeline empty</div>';

            const hasAnyChanges = staged.length > 0 || unstaged.length > 0;
            updateCommitButtonState(hasAnyChanges);
          }
        });

        commitMessageInput.addEventListener('input', () => {
          const hasChanges = document.querySelectorAll('.file-item').length > 0;
          updateCommitButtonState(hasChanges);
        });

        function renderFileItem(s, isStaged) {
          const statusChar = isStaged ? s.staged : (s.staged === '?' ? '?' : s.unstaged);
          const statusClass = (isStaged ? 'S-' : 'U-') + statusChar;
          
          let actionBtn = '';
          let discardBtn = '';

          if (isStaged) {
            actionBtn = '<span class="action-icon codicon codicon-remove" title="Unstage" onclick="event.stopPropagation(); unstage(\\'' + s.path + '\\')"></span>';
          } else {
            actionBtn = '<span class="action-icon codicon codicon-add" title="Stage" onclick="event.stopPropagation(); stage(\\'' + s.path + '\\')"></span>';
            discardBtn = '<span class="action-icon codicon codicon-discard" title="Discard" onclick="event.stopPropagation(); discard(\\'' + s.path + '\\', \\'' + (s.staged === '?' ? '??' : s.unstaged) + '\\')"></span>';
          }

          const escapedPath = escapeHtml(s.path);

          return '<div class="file-item" onclick="openFile(\\'' + s.path + '\\')">' +
              '<div class="status-dot ' + statusClass + '"></div>' +
              '<div class="file-info">' +
                '<span class="file-name">' + escapedPath + '</span>' +
              '</div>' +
              '<div class="file-actions">' +
                '<span class="action-icon codicon codicon-go-to-file" title="Open" onclick="event.stopPropagation(); openFile(\\'' + s.path + '\\')"></span>' +
                discardBtn +
                actionBtn +
              '</div>' +
            '</div>';
        }
      </script>
    </body>
    </html>`;
}
