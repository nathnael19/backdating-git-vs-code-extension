import * as vscode from "vscode";
import * as path from "path";
import {
  getRepoRoot,
  getCurrentBranch,
  getRecentCommits,
  getGitStatus,
  stageFile,
  unstageFile,
  discardChange,
  stageAll,
  unstageAll,
  discardAll,
  pushToRemote,
  executeGitCommit,
  log,
} from "./gitUtils";
import { getHtmlForWebview } from "./webviewHtml";

export class BackdatingGitSidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _refreshInterval?: ReturnType<typeof setInterval>;
  private _lastValidRoot?: string;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public async resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = getHtmlForWebview();

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
            "CRITICAL: This will PERMANENTLY discard ALL changes in the repository. This action cannot be undone.",
            { modal: true },
            "Discard All Changes",
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
    }, 30000);

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
      } catch (e: unknown) {
        log(`Scan failed for ${folder.name}: ${(e as Error).message}`);
      }
    }

    return undefined;
  }

  private async _refreshAll() {
    if (!this._view) return;
    const root = (await this._getRepoRootForSelection()) || this._lastValidRoot;
    if (root) {
      this._lastValidRoot = root;
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
}
