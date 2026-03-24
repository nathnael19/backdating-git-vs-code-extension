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

  async function getCurrentBranch(cwd: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["rev-parse", "--abbrev-ref", "HEAD"],
        { cwd },
      );
      const branch = stdout.trim();
      log(`Current branch for ${cwd}: ${branch}`);
      return branch;
    } catch (e: any) {
      log(`getCurrentBranch failed for ${cwd}: ${e.message}`);
      return undefined;
    }
  }

  async function getRecentCommits(cwd: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["log", "-n", "10", "--pretty=format:%h - %s (%cr)"],
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
    if (status === "??" || status === "?") {
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
    private _refreshInterval?: NodeJS.Timeout;

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

      if (this._refreshInterval) {
        clearInterval(this._refreshInterval);
      }

      this._refreshInterval = setInterval(() => {
        if (this._view?.visible) {
          this._refreshAll();
        }
      }, 10000);

      webviewView.onDidChangeVisibility(() => {
        if (this._view?.visible) {
          this._refreshAll();
        }
      });

      webviewView.onDidDispose(() => {
        if (this._refreshInterval) {
          clearInterval(this._refreshInterval);
          this._refreshInterval = undefined;
        }
      });
    }

    private async _getRepoRootForSelection(): Promise<string | undefined> {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) return undefined;

      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        const root = await getRepoRoot(
          path.dirname(activeEditor.document.uri.fsPath),
        );
        if (root) return root;
      }

      for (const folder of workspaceFolders) {
        const root = await getRepoRoot(folder.uri.fsPath);
        if (root) return root;
      }

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
        const branch = await getCurrentBranch(root);
        const history = await getRecentCommits(root);
        const status = await getGitStatus(root);
        this._view.webview.postMessage({
          type: "update",
          history,
          status,
          root,
          branch,
        });
      } else {
        this._view.webview.postMessage({ type: "no-repo" });
      }
    }

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
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
              flex: 1;
              box-shadow: 0 4px 15px rgba(197, 160, 40, 0.3);
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
              height: 100vh;
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
                    '<div><span class="history-hash">' + hash + '</span>' + msg + '</div>' +
                    '<span class="history-meta">' + meta + '</span>' +
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

              return '<div class="file-item" onclick="openFile(\\'' + s.path + '\\')">' +
                  '<div class="status-dot ' + statusClass + '"></div>' +
                  '<div class="file-info">' +
                    '<span class="file-name">' + s.path + '</span>' +
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
