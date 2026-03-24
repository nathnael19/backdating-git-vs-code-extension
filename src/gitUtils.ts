import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";

const execFileAsync = promisify(execFile);

let outputChannel: vscode.OutputChannel | undefined;

export function setOutputChannel(channel: vscode.OutputChannel) {
  outputChannel = channel;
}

export function log(message: string) {
  if (outputChannel) {
    const time = new Date().toLocaleTimeString();
    outputChannel.appendLine(`[${time}] ${message}`);
  }
}

export async function getRepoRoot(cwd: string): Promise<string | undefined> {
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

export async function getCurrentBranch(cwd: string): Promise<string | undefined> {
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

export async function getRecentCommits(cwd: string): Promise<string[]> {
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

export async function getGitStatus(
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

export async function stageFile(cwd: string, filePath: string) {
  log(`Staging: ${filePath}`);
  await execFileAsync("git", ["add", filePath], { cwd });
}

export async function unstageFile(cwd: string, filePath: string) {
  log(`Unstaging: ${filePath}`);
  await execFileAsync("git", ["reset", "HEAD", "--", filePath], { cwd });
}

export async function discardChange(cwd: string, filePath: string, status: string) {
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

export async function stageAll(cwd: string) {
  log("Staging all changes");
  await execFileAsync("git", ["add", "."], { cwd });
}

export async function unstageAll(cwd: string) {
  log("Unstaging all changes");
  await execFileAsync("git", ["reset"], { cwd });
}

export async function discardAll(cwd: string) {
  log("Discarding all changes");
  await execFileAsync("git", ["checkout", "."], { cwd });
  await execFileAsync("git", ["clean", "-fd"], { cwd });
}

export async function pushToRemote(cwd: string) {
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

export async function executeGitCommit(
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
