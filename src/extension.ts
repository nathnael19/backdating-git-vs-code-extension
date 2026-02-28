import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";

const execFileAsync = promisify(execFile);
let outputChannel: vscode.OutputChannel;

function log(message: string) {
  if (outputChannel) {
    const time = new Date().toLocaleTimeString();
    outputChannel.appendLine(`[${time}] ${message}`);
  }
}

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Backdating Git");
  log("Extension activated");

  // --- 1. Git Utilities ---
  async function getRepoRoot(cwd: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["rev-parse", "--show-toplevel"],
        { cwd },
      );
      const root = stdout.trim();
      log(`Found repo root: ${root} for cwd: ${cwd}`);
      return root;
    } catch (e: any) {
      log(`getRepoRoot failed for ${cwd}: ${e.message}`);
      return undefined;
    }
  }

  async function getRecentCommits(cwd: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["log", "-n", "3", "--pretty=format:%h - %s (%cr)"],
        { cwd },
      );
      return stdout.split("\n").filter((line) => line.trim() !== "");
    } catch (e: any) {
      log(`getRecentCommits failed: ${e.message}`);
      return ["No commits found"];
    }
  }

  async function getGitStatus(
    cwd: string,
  ): Promise<{ path: string; staged: string; unstaged: string }[]> {
    try {
      const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
        cwd,
      });
      return stdout
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => ({
          staged: line.slice(0, 1).trim() || " ",
          unstaged: line.slice(1, 2).trim() || " ",
          path: line.slice(3).trim(),
        }));
    } catch (e: any) {
      log(`getGitStatus failed: ${e.message}`);
      return [];
    }
  }

  async function stageFile(cwd: string, filePath: string) {
    log(`Staging: ${filePath}`);
    await execFileAsync("git", ["add", filePath], { cwd });
  }

  async function unstageFile(cwd: string, filePath: string) {
    log(`Unstaging: ${filePath}`);
    await execFileAsync("git", ["reset", "HEAD", "--", filePath], { cwd });
  }

  async function discardChange(cwd: string, filePath: string, status: string) {
    log(`Discarding: ${filePath} (status: ${status})`);
    if (status === "??") {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(cwd, filePath);
      await vscode.workspace.fs.delete(vscode.Uri.file(fullPath));
    } else {
      await execFileAsync("git", ["checkout", "--", filePath], { cwd });
    }
  }

  async function stageAll(cwd: string) {
    log("Staging all changes");
    await execFileAsync("git", ["add", "."], { cwd });
  }

  async function unstageAll(cwd: string) {
    log("Unstaging all changes");
    await execFileAsync("git", ["reset"], { cwd });
  }

  async function discardAll(cwd: string) {
    log("Discarding all changes");
    await execFileAsync("git", ["checkout", "."], { cwd });
    await execFileAsync("git", ["clean", "-fd"], { cwd });
  }

  async function pushToRemote(cwd: string) {
    log("Pushing to remote...");
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Pushing to Remote...",
          cancellable: false,
        },
        async () => {
          await execFileAsync("git", ["push"], { cwd });
        },
      );
      vscode.window.showInformationMessage("Successfully pushed to remote!");
    } catch (error: any) {
      log(`Push failed: ${error.stderr || error.message}`);
      vscode.window.showErrorMessage(
        "Push failed: " + (error.stderr || error.message),
      );
    }
  }

  async function executeGitCommit(
    commitMessage: string,
    authorDate: string,
    committerDate: string,
    targetCwd?: string,
  ) {
    try {
      let cwd = targetCwd;
      if (!cwd) {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          cwd = path.dirname(activeEditor.document.uri.fsPath);
        }
      }

      const root = cwd ? await getRepoRoot(cwd) : undefined;
      if (!root) {
        vscode.window.showErrorMessage(
          "Could not determine a valid Git repository root.",
        );
        return;
      }

      log(`Executing commit in root: ${root}`);
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Backdating Git Commit",
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: "Committing..." });
          const env = {
            ...process.env,
            GIT_AUTHOR_DATE: authorDate,
            GIT_COMMITTER_DATE: committerDate,
          };
          await execFileAsync("git", ["commit", "-m", commitMessage], {
            cwd: root,
            env,
          });
        },
      );

      vscode.window.showInformationMessage(`Successfully backdated commit!`);
    } catch (error: any) {
      const msg =
        error.stdout && error.stdout.includes("nothing to commit")
          ? "Nothing to commit. Check if you have staged changes."
          : error.message || "Unknown Git error";
      log(`Commit failed: ${msg}`);
      vscode.window.showErrorMessage(msg);
    }
  }

  let disposable = vscode.commands.registerCommand(
    "backdating-git.commit",
    async () => {
      const message = await vscode.window.showInputBox({
        prompt: "Commit message",
        ignoreFocusOut: true,
      });
      if (!message) return;
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      const date = await vscode.window.showInputBox({
        prompt: "Date (YYYY-MM-DD HH:MM:SS)",
        value: now,
        ignoreFocusOut: true,
      });
      if (!date) return;
      await executeGitCommit(message, date, date);
    },
  );
  context.subscriptions.push(disposable);

  class BackdatingGitSidebarProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public async resolveWebviewView(webviewView: vscode.WebviewView) {
      this._view = webviewView;
      webviewView.webview.options = { enableScripts: true };
      webviewView.webview.html = await this._getHtmlForWebview(
        webviewView.webview,
      );

      webviewView.webview.onDidReceiveMessage(async (data) => {
        const root = await this._getRepoRootForSelection();
        if (!root && data.type !== "refresh") {
          log(`Message ignored: No repo root found for action ${data.type}`);
          return;
        }

        switch (data.type) {
          case "commit":
            await executeGitCommit(
              data.message,
              data.authorDate,
              data.committerDate,
              root!,
            );
            this._refreshAll();
            break;
          case "push":
            await pushToRemote(root!);
            this._refreshAll();
            break;
          case "stage":
            await stageFile(root!, data.file);
            this._refreshAll();
            break;
          case "unstage":
            await unstageFile(root!, data.file);
            this._refreshAll();
            break;
          case "discard": {
            const confirm = await vscode.window.showWarningMessage(
              `Are you sure you want to discard changes in ${data.file}?`,
              { modal: true },
              "Discard Changes",
            );
            if (confirm) {
              await discardChange(root!, data.file, data.status);
              this._refreshAll();
            }
            break;
          }
          case "stageAll":
            await stageAll(root!);
            this._refreshAll();
            break;
          case "unstageAll":
            await unstageAll(root!);
            this._refreshAll();
            break;
          case "discardAll": {
            const confirmAll = await vscode.window.showWarningMessage(
              "Are you sure you want to discard ALL changes?",
              { modal: true },
              "Discard All",
            );
            if (confirmAll) {
              await discardAll(root!);
              this._refreshAll();
            }
            break;
          }
          case "openFile": {
            const fullPath = path.isAbsolute(data.file)
              ? data.file
              : path.join(root!, data.file);
            const doc = await vscode.workspace.openTextDocument(
              vscode.Uri.file(fullPath),
            );
            await vscode.window.showTextDocument(doc);
            break;
          }
          case "refresh": {
            log("Manual refresh requested");
            this._refreshAll();
            break;
          }
        }
      });

      this._refreshAll();
      setInterval(() => this._refreshAll(), 5000);
    }

    private async _getRepoRootForSelection(): Promise<string | undefined> {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) return undefined;

      // 1. Try active editor directory
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        const root = await getRepoRoot(
          path.dirname(activeEditor.document.uri.fsPath),
        );
        if (root) return root;
      }

      // 2. Try workspace roots
      for (const folder of workspaceFolders) {
        const root = await getRepoRoot(folder.uri.fsPath);
        if (root) return root;
      }

      // 3. Fallback: Scan subdirectories (for monorepos)
      log("Deep scanning workspace for .git folders...");
      for (const folder of workspaceFolders) {
        try {
          const children = await vscode.workspace.fs.readDirectory(folder.uri);
          for (const [name, type] of children) {
            if (type === vscode.FileType.Directory) {
              const subPath = path.join(folder.uri.fsPath, name);
              const root = await getRepoRoot(subPath);
              if (root) return root;
            }
          }
        } catch (e) {
          log(`Scan failed for ${folder.name}: ${e}`);
        }
      }

      return undefined;
    }

    private async _refreshAll() {
      if (!this._view) return;
      const root = await this._getRepoRootForSelection();
      if (root) {
        const history = await getRecentCommits(root);
        const status = await getGitStatus(root);
        this._view.webview.postMessage({
          type: "update",
          history,
          status,
          root,
        });
      } else {
        this._view.webview.postMessage({ type: "no-repo" });
      }
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
      const now = new Date();
      const tzOffset = now.getTimezoneOffset() * 60000;
      const localISOTime = new Date(now.getTime() - tzOffset)
        .toISOString()
        .slice(0, 16);

      const codiconsUri = webview.asWebviewUri(
        vscode.Uri.joinPath(
          this._extensionUri,
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
          <link href="${codiconsUri}" rel="stylesheet" />
          <style>
            :root {
              --bg: var(--vscode-sideBar-background);
              --fg: var(--vscode-sideBar-foreground);
              --input-bg: var(--vscode-input-background);
              --btn-bg: var(--vscode-button-background);
              --btn-hover: var(--vscode-button-hoverBackground);
              --border: var(--vscode-widget-border);
              --accent: var(--vscode-button-background);
              --mod-fg: #e2c08d;
              --add-fg: #81b88b;
              --del-fg: #c74e39;
              --unt-fg: #73c991;
            }
            body { font-family: var(--vscode-font-family); color: var(--fg); padding: 12px; font-size: 13px; line-height: 1.4; overflow-x: hidden; }
            .card { background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 16px; backdrop-filter: blur(5px); }
            .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; cursor: pointer; user-select: none; }
            h3 { margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; pointer-events: none; }
            .action-bar { display: flex; gap: 4px; }
            textarea, input { 
              width: 100%; box-sizing: border-box; background: var(--input-bg); color: var(--vscode-input-foreground); 
              border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 8px; font-family: inherit; margin-bottom: 8px;
            }
            textarea { min-height: 60px; resize: none; transition: border-color 0.2s; }
            textarea:focus { border-color: var(--accent); outline: none; }
            .presets { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 12px; }
            .preset-btn { 
              font-size: 10px; padding: 4px; border: 1px solid var(--border); background: transparent; 
              color: var(--fg); border-radius: 4px; cursor: pointer; opacity: 0.8;
            }
            .preset-btn:hover { background: rgba(255,255,255,0.1); opacity: 1; }
            .toggle-group { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
            .switch { position: relative; display: inline-block; width: 30px; height: 16px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #555; transition: .2s; border-radius: 16px; }
            .slider:before { position: absolute; content: ""; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: white; transition: .2s; border-radius: 50%; }
            input:checked + .slider { background-color: var(--accent); }
            input:checked + .slider:before { transform: translateX(14px); }
            .hidden { display: none; }
            .btn-primary { 
              width: 100%; padding: 10px; background: var(--btn-bg); color: white; border: none; 
              border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; 
            }
            .btn-primary:hover { background: var(--btn-hover); transform: translateY(-1px); }
            
            .file-list { margin-bottom: 12px; }
            .file-item { display: flex; align-items: center; padding: 4px 6px; font-size: 12px; border-radius: 4px; transition: background 0.1s; cursor: pointer; position: relative; }
            .file-item:hover { background: rgba(255,255,255,0.05); }
            .file-item:hover .file-actions { display: flex; }
            .status-badge { width: 14px; text-align: center; font-weight: bold; font-size: 10px; margin-right: 8px; border-radius: 2px; }
            .S-M { color: var(--mod-fg); } .U-M { color: var(--mod-fg); }
            .S-A { color: var(--add-fg); } .U-A { color: var(--add-fg); }
            .S-D { color: var(--del-fg); } .U-D { color: var(--del-fg); }
            .S-? { color: var(--unt-fg); } .U-? { color: var(--unt-fg); }
            
            .file-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; opacity: 0.8; }
            .file-actions { display: none; position: absolute; right: 4px; background: var(--bg); padding-left: 8px; box-shadow: -10px 0 10px var(--bg); }
            .icon-btn { cursor: pointer; padding: 2px 4px; opacity: 0.6; font-size: 14px; display: flex; align-items: center; justify-content: center; }
            .icon-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); border-radius: 4px; }
            
            .history-item { font-size: 11px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); opacity: 0.8; }
            .history-item:last-child { border: none; }
            .history-item code { color: var(--accent); font-weight: bold; }
            .empty-msg { font-size: 11px; opacity: 0.4; font-style: italic; text-align: center; padding: 8px 0; }

            .push-section { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
            .btn-push { background: transparent; border: 1px solid var(--accent); color: var(--accent); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; display: flex; align-items: center; gap: 4px; transition: 0.2s; }
            .btn-push:hover { background: var(--accent); color: white; }
            
            .no-repo { text-align: center; padding: 40px 20px; opacity: 0.6; }
            .no-repo i { font-size: 32px; display: block; margin-bottom: 12px; }
            .repo-path { font-size: 10px; opacity: 0.5; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          </style>
        </head>
        <body>
          <div id="repo-container">
            <div class="repo-path" id="currentRepo">No repository selected</div>
            <div class="card">
                <div class="section-header" onclick="toggleSection('staged-files')">
                <h3>Staged Changes</h3>
                <div class="action-bar">
                    <span class="icon-btn codicon codicon-remove" title="Unstage All" onclick="event.stopPropagation(); unstageAll()"></span>
                </div>
                </div>
                <div id="staged-files" class="file-list"></div>

                <div class="section-header" onclick="toggleSection('unstaged-files')">
                <h3>Changes</h3>
                <div class="action-bar">
                    <span class="icon-btn codicon codicon-discard" title="Discard All" onclick="event.stopPropagation(); discardAll()"></span>
                    <span class="icon-btn codicon codicon-add" title="Stage All" onclick="event.stopPropagation(); stageAll()"></span>
                </div>
                </div>
                <div id="unstaged-files" class="file-list"></div>
            </div>

            <div class="card">
                <h3>Commit Message</h3>
                <textarea id="msg" placeholder="What did you change?"></textarea>
            </div>

            <div class="card">
                <h3>Date & Time</h3>
                <div class="presets">
                    <button class="preset-btn" onclick="setPreset(1)">Yesterday</button>
                    <button class="preset-btn" onclick="setPreset(7)">1 Week Ago</button>
                    <button class="preset-btn" onclick="setPreset(30)">1 Month Ago</button>
                </div>
                
                <label style="font-size:10px; opacity:0.6;">Author Date</label>
                <input type="datetime-local" id="authorDate" value="${localISOTime}">
                <div id="committerDateGroup" class="hidden">
                    <label style="font-size:10px; opacity:0.6;">Committer Date</label>
                    <input type="datetime-local" id="committerDate" value="${localISOTime}">
                </div>
                <div class="toggle-group">
                    <span style="font-size:11px; opacity:0.8;">Same for Committer?</span>
                    <label class="switch">
                        <input type="checkbox" id="syncDate" checked onchange="toggleCommitter()">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>

            <div style="display: flex; gap: 8px;">
                <button class="btn-primary" style="flex: 2;" onclick="doCommit()">Backdate Commit</button>
                <button class="btn-push" title="Push to Remote" onclick="pushToRemote()">
                <span class="codicon codicon-cloud-upload"></span> Push
                </button>
            </div>

            <div class="card" style="margin-top:20px;">
                <div class="section-header">
                <h3>Recent History</h3>
                <span class="icon-btn codicon codicon-refresh" title="Refresh Status" onclick="refreshStatus()"></span>
                </div>
                <div id="historyList">Loading history...</div>
            </div>
          </div>

          <div id="no-repo-container" class="hidden">
            <div class="no-repo">
                <i class="codicon codicon-error"></i>
                <p>No Git repository found in the current context.</p>
                <p style="font-size:11px;">Open a file from a Git repo or initialize one to get started.</p>
                <button class="btn-primary" onclick="refreshStatus()" style="margin-top:12px;">Retry Discovery</button>
            </div>
          </div>

          <script>
            const vscode = acquireVsCodeApi();
            
            function toggleSection(id) {
              const el = document.getElementById(id);
              el.style.display = el.style.display === 'none' ? 'block' : 'none';
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
              const msg = document.getElementById('msg').value;
              const authorDate = document.getElementById('authorDate').value.replace('T', ' ') + ':00';
              const sync = document.getElementById('syncDate').checked;
              const committerDate = sync ? authorDate : document.getElementById('committerDate').value.replace('T', ' ') + ':00';
              if(!msg) { alert('Please enter a message'); return; }
              vscode.postMessage({ type: 'commit', message: msg, authorDate, committerDate });
              document.getElementById('msg').value = '';
            }

            window.addEventListener('message', event => {
              const data = event.data;
              const repoContainer = document.getElementById('repo-container');
              const noRepoContainer = document.getElementById('no-repo-container');

              if (data.type === 'no-repo') {
                repoContainer.classList.add('hidden');
                noRepoContainer.classList.remove('hidden');
                return;
              }

              if (data.type === 'update') {
                repoContainer.classList.remove('hidden');
                noRepoContainer.classList.add('hidden');
                
                document.getElementById('currentRepo').textContent = data.root;

                const { history, status } = data;
                const stagedEl = document.getElementById('staged-files');
                const unstagedEl = document.getElementById('unstaged-files');
                
                const staged = status.filter(s => s.staged !== ' ' && s.staged !== '?');
                const unstaged = status.filter(s => s.unstaged !== ' ' || s.staged === '?');

                stagedEl.innerHTML = staged.length ? staged.map(s => renderFileItem(s, true)).join('') : '<div class="empty-msg">Nothing staged</div>';
                unstagedEl.innerHTML = unstaged.length ? unstaged.map(s => renderFileItem(s, false)).join('') : '<div class="empty-msg">No changes</div>';

                const histList = document.getElementById('historyList');
                histList.innerHTML = history.length > 0 ? history.map(h => {
                  const parts = h.split(' - ');
                  return '<div class="history-item"><code>' + parts[0] + '</code> - ' + parts.slice(1).join(' - ') + '</div>';
                }).join('') : '<div class="empty-msg">No recent commits</div>';
              }
            });

            function renderFileItem(s, isStaged) {
              const statusChar = isStaged ? s.staged : (s.staged === '?' ? '?' : s.unstaged);
              const statusClass = (isStaged ? 'S-' : 'U-') + statusChar;
              
              let actionBtn = '';
              let discardBtn = '';

              if (isStaged) {
                actionBtn = '<span class="icon-btn codicon codicon-remove" title="Unstage" onclick="event.stopPropagation(); unstage(\\'' + s.path + '\\')"></span>';
              } else {
                actionBtn = '<span class="icon-btn codicon codicon-add" title="Stage" onclick="event.stopPropagation(); stage(\\'' + s.path + '\\')"></span>';
                discardBtn = '<span class="icon-btn codicon codicon-discard" title="Discard Changes" onclick="event.stopPropagation(); discard(\\'' + s.path + '\\', \\'' + (s.staged === '?' ? '??' : s.unstaged) + '\\')"></span>';
              }

              return '<div class="file-item" onclick="openFile(\\'' + s.path + '\\')">' +
                  '<span class="status-badge ' + statusClass + '">' + (statusChar === '?' ? 'U' : statusChar) + '</span>' +
                  '<span class="file-path">' + s.path + '</span>' +
                  '<div class="file-actions">' +
                    '<span class="icon-btn codicon codicon-go-to-file" title="Open File" onclick="event.stopPropagation(); openFile(\\'' + s.path + '\\')"></span>' +
                    discardBtn +
                    actionBtn +
                  '</div>' +
                '</div>';
            }
          </script>
        </body>
        </html>`;
    }
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "backdating-git.sidebar",
      new BackdatingGitSidebarProvider(context.extensionUri),
    ),
  );
}

export function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
  }
}
