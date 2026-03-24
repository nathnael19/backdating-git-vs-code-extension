
export function getHtmlForWebview(): string {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  const localISOTime = new Date(now.getTime() - tzOffset)
    .toISOString()
    .slice(0, 16);

  return `<!DOCTYPE html>
    <html class="dark" lang="en">
    <head>
      <meta charset="utf-8"/>
      <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
      <title>Backdating Git VS Code Extension</title>
      <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
      <script>
        tailwind.config = {
          darkMode: 'class',
          theme: {
            extend: {
              colors: {
                vscode: {
                  bg: '#0d1117',
                  border: '#30363d',
                  card: '#161b22',
                  input: '#0d1117',
                  text: '#c9d1d9',
                  muted: '#8b949e',
                  accent: '#238636',
                  hover: '#21262d',
                  highlight: '#f2cc60',
                  button: '#21262d'
                }
              }
            }
          }
        }
      </script>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@500&display=swap');

        ::-webkit-scrollbar { width: 10px; }
        ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 5px; }
        ::-webkit-scrollbar-thumb:hover { background: #484f58; }

        .custom-card {
          border: 1px solid #30363d;
          border-radius: 12px;
          padding: 16px;
          background: #161b22;
        }
        .badge {
          background-color: rgba(242, 204, 96, 0.1);
          color: #f2cc60;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .file-item {
          display: flex;
          align-items: center;
          padding: 6px 0;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
        }
        .file-item:hover {
          color: #f2cc60;
        }
        .dot {
          height: 8px;
          width: 8px;
          border-radius: 50%;
          display: inline-block;
          margin-right: 12px;
          flex-shrink: 0;
        }

        .dot-mod { background-color: #E2C08D; box-shadow: 0 0 4px #E2C08D; }
        .dot-add { background-color: #81B88B; box-shadow: 0 0 4px #81B88B; }
        .dot-del { background-color: #C74E39; box-shadow: 0 0 4px #C74E39; }
        .dot-unt { background-color: #73C991; box-shadow: 0 0 4px #73C991; }

        .hidden { display: none !important; }

        input[type="datetime-local"]::-webkit-calendar-picker-indicator {
          filter: invert(1);
          cursor: pointer;
        }

        .action-btn {
          opacity: 0;
          transition: opacity 0.2s;
        }
        .file-item:hover .action-btn { opacity: 1; }

        .dot-main { background-color: #f2cc60; box-shadow: 0 0 4px #f2cc60; }
      </style>
    </head>
    <body class="bg-vscode-bg text-vscode-text font-sans antialiased">
      <div id="main-view" class="max-w-[585px] mx-auto p-4 min-h-screen">
        <header class="flex justify-between items-center mb-6 text-xs text-vscode-muted px-2">
          <div class="truncate" id="currentRepo">Discovering...</div>
          <div id="branchPill" class="flex items-center bg-black/30 px-2 py-1 rounded border border-vscode-border hidden">
            <svg class="w-3 h-3 text-vscode-highlight mr-1" fill="currentColor" viewbox="0 0 24 24"><path d="M15 11c0-1.1-.9-2-2-2h-1V7h1c1.66 0 3 1.34 3 3v2h2v-2c0-2.76-2.24-5-5-5h-1V1h-2v2h-1c-2.76 0-5 2.24-5 5v12c0 2.76 2.24 5 5 5h1v2h2v-2h1c2.76 0 5-2.24 5-5v-2h-2v2c0 1.1-.9 2-2 2h-1v-2h1c1.1 0 2-.9 2-2zM9 8c0-1.1.9-2 2-2h1v2h-1c-1.1 0-2 .9-2 2z"></path></svg>
            <span class="text-vscode-highlight font-bold" id="currentBranchName"></span>
          </div>
        </header>

        <div class="custom-card mb-6">
          <div class="mb-6">
            <div class="flex justify-between items-center mb-4">
              <span class="badge">Staged Changes</span>
              <button class="text-vscode-muted hover:text-white transition-colors" onclick="unstageAll()" title="Unstage All">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
              </button>
            </div>
            <div id="staged-files"></div>
          </div>

          <div>
            <div class="flex justify-between items-center mb-4">
              <span class="badge">Unstaged Changes</span>
              <div class="flex gap-4 text-vscode-muted">
                <button class="hover:text-white transition-colors" onclick="discardAll()" title="Discard All">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                </button>
                <button class="hover:text-white transition-colors" onclick="stageAll()" title="Stage All">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                </button>
              </div>
            </div>
            <div id="unstaged-files"></div>
          </div>
        </div>

        <div class="custom-card mb-6">
          <div class="mb-4">
            <span class="badge">Commit Details</span>
          </div>
          <textarea id="msg" class="w-full bg-vscode-input border border-vscode-border rounded-lg p-3 text-sm focus:ring-1 focus:ring-vscode-highlight focus:border-vscode-highlight outline-none h-24 mb-4 text-vscode-text" placeholder="Summarize your changes..."></textarea>
          
          <div class="flex flex-wrap gap-2 mb-6">
            <button class="px-3 py-1.5 bg-vscode-button border border-vscode-border rounded-lg text-xs hover:bg-vscode-hover hover:border-vscode-highlight transition-all" onclick="setPreset(1)">Yesterday</button>
            <button class="px-3 py-1.5 bg-vscode-button border border-vscode-border rounded-lg text-xs hover:bg-vscode-hover hover:border-vscode-highlight transition-all" onclick="setPreset(7)">1 week ago</button>
            <button class="px-3 py-1.5 bg-vscode-button border border-vscode-border rounded-lg text-xs hover:bg-vscode-hover hover:border-vscode-highlight transition-all" onclick="setPreset(30)">1 month ago</button>
            <button class="px-3 py-1.5 bg-vscode-button border border-vscode-border rounded-lg text-xs hover:bg-vscode-hover hover:border-vscode-highlight transition-all" onclick="setPreset(365)">1 year ago</button>
          </div>

          <div class="mb-2">
            <label class="block text-xs text-vscode-muted mb-2">Target Date</label>
            <div class="relative">
              <input id="targetDate" class="w-full bg-vscode-input border border-vscode-border rounded-lg p-3 text-sm focus:ring-1 focus:ring-vscode-highlight focus:border-vscode-highlight outline-none" type="datetime-local" value="${localISOTime}"/>
            </div>
          </div>
        </div>

        <div class="flex gap-2 mb-8">
          <button id="commitButton" class="flex-grow bg-vscode-button border border-vscode-border hover:bg-vscode-hover hover:border-vscode-highlight text-blue-400 font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed" onclick="doCommit()">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
            Backdate Commit
          </button>
          <button class="w-14 bg-vscode-button border border-vscode-border hover:bg-vscode-hover hover:border-vscode-highlight flex items-center justify-center rounded-lg text-vscode-highlight transition-all" onclick="pushToRemote()" title="Push to Remote">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
          </button>
        </div>

        <div class="custom-card mb-6">
          <div class="flex justify-between items-center mb-6">
            <span class="badge">Recent Timeline</span>
            <button class="text-vscode-muted hover:text-white transition-colors" onclick="refreshStatus()">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
            </button>
          </div>
          <div id="historyList" class="space-y-6"></div>
        </div>
      </div>

      <div id="no-repo-view" class="flex flex-col items-center justify-center min-h-screen p-8 text-center hidden">
        <svg class="w-16 h-16 text-vscode-muted opacity-30 mb-4" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M15 11c0-1.1-.9-2-2-2h-1V7h1c1.66 0 3 1.34 3 3v2h2v-2c0-2.76-2.24-5-5-5h-1V1h-2v2h-1c-2.76 0-5 2.24-5 5v12c0 2.76 2.24 5 5 5h1v2h2v-2h1c2.76 0 5-2.24 5-5v-2h-2v2c0 1.1-.9 2-2 2h-1v-2h1c1.1 0 2-.9 2-2zM9 8c0-1.1.9-2 2-2h1v2h-1c-1.1 0-2 .9-2 2z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
        <div class="text-lg font-bold mb-2">No Repository Found</div>
        <div class="text-sm text-vscode-muted mb-6 px-4">Open a file from a Git repository or initialize one to enable backdating features.</div>
        <button class="px-6 py-3 bg-vscode-button border border-vscode-border rounded-lg text-vscode-highlight hover:bg-vscode-hover transition-all" onclick="refreshStatus()">Retry Discovery</button>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        const commitButton = document.getElementById('commitButton');
        const commitMessageInput = document.getElementById('msg');

        function escapeHtml(text) {
          if (!text) return "";
          const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
          return text.replace(/[&<>"']/g, function(m) { return map[m]; });
        }

        function updateCommitButtonState(hasChanges) {
          const msg = commitMessageInput.value.trim();
          commitButton.disabled = !msg || !hasChanges;
        }

        function setPreset(days) {
          const date = new Date();
          date.setDate(date.getDate() - days);
          const tzOffset = date.getTimezoneOffset() * 60000;
          const formatted = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
          document.getElementById('targetDate').value = formatted;
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
          const target = document.getElementById('targetDate').value.replace('T', ' ') + ':00';
          if(!msg) return;
          // Send same date for author and committer as requested
          vscode.postMessage({ type: 'commit', message: msg, authorDate: target, committerDate: target });
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

            stagedEl.innerHTML = staged.length ? staged.map(s => renderFileItem(s, true)).join('') : '<div class="text-vscode-muted text-sm italic text-center py-4">Nothing staged</div>';
            unstagedEl.innerHTML = unstaged.length ? unstaged.map(s => renderFileItem(s, false)).join('') : '<div class="text-vscode-muted text-sm italic text-center py-4">No changes</div>';

            const histList = document.getElementById('historyList');
            histList.innerHTML = history.length > 0 ? history.map(h => {
              const parts = h.split(' - ');
              const hash = parts[0];
              const rest = parts.slice(1).join(' - ');
              const metaMatch = rest.match(/\\(([^)]+)\\)$/);
              const meta = metaMatch ? metaMatch[1] : '';
              const msg = metaMatch ? rest.replace(metaMatch[0], '').trim() : rest;
              
              return '<div class="transition-all hover:translate-x-1">' +
                '<div class="flex items-start gap-2 mb-1">' +
                  '<span class="text-vscode-highlight font-mono text-sm font-bold">' + escapeHtml(hash) + '</span>' +
                  '<p class="text-sm">' + escapeHtml(msg) + '</p>' +
                '</div>' +
                '<div class="text-xs text-vscode-muted">' + escapeHtml(meta) + '</div>' +
              '</div>';
            }).join('') : '<div class="text-vscode-muted text-xs text-center">Timeline empty</div>';

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
          let dotClass = 'dot-mod';
          if (statusChar === 'A' || statusChar === '?') dotClass = 'dot-add';
          if (statusChar === 'D') dotClass = 'dot-del';
          
          let actions = '';
          if (isStaged) {
            actions = '<button class="action-btn text-vscode-muted hover:text-white transition-colors" title="Unstage" onclick="event.stopPropagation(); unstage(\\'' + s.path + '\\')"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg></button>';
          } else {
            actions = '<button class="action-btn text-vscode-muted hover:text-vscode-highlight transition-colors" title="Stage" onclick="event.stopPropagation(); stage(\\'' + s.path + '\\')"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg></button>';
          }

          return '<div class="file-item group" onclick="openFile(\\'' + s.path + '\\')">' +
            '<span class="dot ' + dotClass + '"></span>' +
            '<span class="flex-grow truncate">' + escapeHtml(s.path) + '</span>' +
            '<div class="flex gap-2 items-center">' +
              actions +
            '</div>' +
          '</div>';
        }
      </script>
    </body>
    </html>`;
}
