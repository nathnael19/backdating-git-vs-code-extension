import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export function activate(context: vscode.ExtensionContext) {
  // --- 1. Git Utilities ---
  async function getRepoRoot(cwd: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["rev-parse", "--show-toplevel"],
        { cwd },
      );
      return stdout.trim();
    } catch {
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
    } catch {
      return ["No commits found"];
    }
  }

  async function getGitStatus(
    cwd: string,
  ): Promise<{ path: string; status: string }[]> {
    try {
      const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
        cwd,
      });
      return stdout
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => ({
          status: line.slice(0, 2).trim(),
          path: line.slice(3).trim(),
        }));
    } catch {
      return [];
    }
  }

  async function stageFile(cwd: string, filePath: string) {
    await execFileAsync("git", ["add", filePath], { cwd });
  }

  async function stageAll(cwd: string) {
    await execFileAsync("git", ["add", "."], { cwd });
  }

  // --- 2. Advanced Git Execution Logic ---
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
          const documentUri = activeEditor.document.uri;
          const workspaceFolderForDocument =
            vscode.workspace.getWorkspaceFolder(documentUri);
          cwd = workspaceFolderForDocument
            ? workspaceFolderForDocument.uri.fsPath
            : vscode.Uri.joinPath(documentUri, "..").fsPath;
        }
      }

      if (!cwd) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          const gitPaths = await vscode.workspace.findFiles(
            "**/.git/config",
            "**/node_modules/**",
          );
          const repoRoots = Array.from(
            new Set(
              gitPaths.map((p) => vscode.Uri.joinPath(p, "..", "..").fsPath),
            ),
          );

          if (repoRoots.length === 1) cwd = repoRoots[0];
          else if (repoRoots.length > 1) {
            const selected = await vscode.window.showQuickPick(
              repoRoots.map((r) => ({
                label: vscode.workspace.asRelativePath(r),
                targetPath: r,
              })),
              { placeHolder: "Select repository:" },
            );
            if (selected) cwd = selected.targetPath;
            else return;
          } else cwd = workspaceFolders[0].uri.fsPath;
        }
      }

      const root = cwd ? await getRepoRoot(cwd) : undefined;
      if (!root) {
        vscode.window.showErrorMessage(
          "Could not determine a valid Git repository root.",
        );
        return;
      }

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
          // Note: In this version, we assume user might have staged files manually or via UI.
          // If nothing is staged, git commit will fail, which we handle.
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
          ? "Nothing to commit. Have you staged your changes?"
          : error.message || "Unknown Git error";
      vscode.window.showErrorMessage(msg);
    }
  }

  // --- 3. Command Palette Trigger ---
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

  // --- 4. Modern Sidebar Webview Provider ---
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
        if (!root) return;

        switch (data.type) {
          case "commit":
            await executeGitCommit(
              data.message,
              data.authorDate,
              data.committerDate,
              root,
            );
            this._refreshAll();
            break;
          case "stage":
            await stageFile(root, data.file);
            this._refreshAll();
            break;
          case "stageAll":
            await stageAll(root);
            this._refreshAll();
            break;
          case "refresh":
            this._refreshAll();
            break;
        }
      });

      this._refreshAll();
      setInterval(() => this._refreshAll(), 10000);
    }

    private async _getRepoRootForSelection(): Promise<string | undefined> {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) return undefined;

      let cwd: string | undefined;
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        const documentUri = activeEditor.document.uri;
        const workspaceFolderForDocument =
          vscode.workspace.getWorkspaceFolder(documentUri);
        cwd = workspaceFolderForDocument
          ? workspaceFolderForDocument.uri.fsPath
          : vscode.Uri.joinPath(documentUri, "..").fsPath;
      }
      if (!cwd) cwd = workspaceFolders[0].uri.fsPath;

      return await getRepoRoot(cwd);
    }

    private async _refreshAll() {
      if (!this._view) return;
      const root = await this._getRepoRootForSelection();
      if (root) {
        const history = await getRecentCommits(root);
        const status = await getGitStatus(root);
        this._view.webview.postMessage({ type: "update", history, status });
      }
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
      const now = new Date();
      const tzOffset = now.getTimezoneOffset() * 60000;
      const localISOTime = new Date(now.getTime() - tzOffset)
        .toISOString()
        .slice(0, 16);

      return `<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <style>
            :root {
              --bg: var(--vscode-sideBar-background);
              --fg: var(--vscode-sideBar-foreground);
              --input-bg: var(--vscode-input-background);
              --btn-bg: var(--vscode-button-background);
              --btn-hover: var(--vscode-button-hoverBackground);
              --border: var(--vscode-widget-border);
              --accent: var(--vscode-button-background);
            }
            body { font-family: var(--vscode-font-family); color: var(--fg); padding: 12px; font-size: 13px; line-height: 1.4; }
            .card { background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 16px; backdrop-filter: blur(5px); }
            .header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
            h3 { margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; }
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
            
            .file-item { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; font-size: 11px; opacity: 0.9; }
            .file-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; margin-right: 8px; }
            .stage-btn { 
              cursor: pointer; background: transparent; border: none; color: var(--fg); opacity: 0.5; font-size: 16px; font-weight: bold;
              padding: 0 4px; border-radius: 4px; display: flex; align-items: center;
            }
            .stage-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }
            
            .history-item { font-size: 11px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); opacity: 0.8; }
            .history-item:last-child { border: none; }
            .history-item code { color: var(--accent); font-weight: bold; }
            .empty-msg { font-size: 11px; opacity: 0.5; font-style: italic; text-align: center; padding: 10px 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header-row">
              <h3>Changes</h3>
              <button class="stage-btn" title="Stage All" onclick="stageAll()">+</button>
            </div>
            <div id="statusList">Loading changes...</div>
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

          <button class="btn-primary" onclick="doCommit()">Backdate Commit</button>

          <div class="card" style="margin-top:20px;">
            <h3>Recent History</h3>
            <div id="historyList">Loading history...</div>
          </div>

          <script>
            const vscode = acquireVsCodeApi();
            
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

            function stageFile(file) {
              vscode.postMessage({ type: 'stage', file: file });
            }

            function stageAll() {
              vscode.postMessage({ type: 'stageAll' });
            }

            function doCommit() {
              const msg = document.getElementById('msg').value;
              const authorDate = document.getElementById('authorDate').value.replace('T', ' ') + ':00';
              const sync = document.getElementById('syncDate').checked;
              const committerDate = sync ? authorDate : document.getElementById('committerDate').value.replace('T', ' ') + ':00';

              if(!msg) { alert('Please enter a message'); return; }

              vscode.postMessage({
                type: 'commit',
                message: msg,
                authorDate: authorDate,
                committerDate: committerDate
              });
              document.getElementById('msg').value = '';
            }

            window.addEventListener('message', event => {
              const { type, history, status } = event.data;
              
              if (type === 'update') {
                // Update History
                const histList = document.getElementById('historyList');
                histList.innerHTML = history.length > 0 ? history.map(h => {
                  const parts = h.split(' - ');
                  return \`<div class="history-item"><code>\${parts[0]}</code> - \${parts.slice(1).join(' - ')}</div>\`;
                }).join('') : '<div class="empty-msg">No recent commits</div>';

                // Update Status
                const statList = document.getElementById('statusList');
                statList.innerHTML = status.length > 0 ? status.map(s => \`
                  <div class="file-item">
                    <span class="file-path" title="\${s.path}">[\${s.status}] \${s.path}</span>
                    <button class="stage-btn" onclick="stageFile('\${s.path}')">+</button>
                  </div>
                \`).join('') : '<div class="empty-msg">No changes to stage</div>';
              }
            });
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

export function deactivate() {}
