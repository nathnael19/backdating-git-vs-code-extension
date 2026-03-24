import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";

const execFileAsync = promisify(execFile);
const GIT_BIN = "git";

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
      GIT_BIN,
      ["rev-parse", "--show-toplevel"],
      { cwd },
    );
    const root = stdout.trim();
    log(`Found repo root: ${root} for cwd: ${cwd}`);
    return root;
  } catch (e: unknown) {
    log(`getRepoRoot failed: ${(e as Error).message}`);
    return undefined;
  }
}

export async function getCurrentBranch(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      GIT_BIN,
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd },
    );
    const branch = stdout.trim();
    log(`Current branch: ${branch}`);
    return branch;
  } catch (e: unknown) {
    log(`getCurrentBranch failed: ${(e as Error).message}`);
    return undefined;
  }
}

export async function getRecentCommits(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      GIT_BIN,
      ["log", "-n", "10", "--pretty=format:%h - %s (%cr)"],
      { cwd },
    );
    return stdout.split("\n").filter((line) => line.trim() !== "");
  } catch (e: unknown) {
    log(`getRecentCommits failed: ${(e as Error).message}`);
    return ["No commits found"];
  }
}

export async function getGitStatus(
  cwd: string,
): Promise<{ path: string; staged: string; unstaged: string }[]> {
  try {
    const { stdout } = await execFileAsync(GIT_BIN, ["status", "--porcelain"], {
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
  } catch (e: unknown) {
    log(`getGitStatus failed: ${(e as Error).message}`);
    return [];
  }
}

export async function stageFile(cwd: string, filePath: string) {
  try {
    log(`Staging: ${filePath}`);
    await execFileAsync(GIT_BIN, ["add", "--", filePath], { cwd });
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const msg = `Failed to stage ${filePath}: ${err.stderr || err.message}`;
    log(msg);
    vscode.window.showErrorMessage(msg);
  }
}

export async function unstageFile(cwd: string, filePath: string) {
  try {
    log(`Unstaging: ${filePath}`);
    await execFileAsync(GIT_BIN, ["reset", "HEAD", "--", filePath], { cwd });
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const msg = `Failed to unstage ${filePath}: ${err.stderr || err.message}`;
    log(msg);
    vscode.window.showErrorMessage(msg);
  }
}

export async function discardChange(cwd: string, filePath: string, status: string) {
  try {
    log(`Discarding: ${filePath} (status: ${status})`);
    if (status === "??" || status === "?") {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(cwd, filePath);
      await vscode.workspace.fs.delete(vscode.Uri.file(fullPath));
    } else {
      await execFileAsync(GIT_BIN, ["checkout", "--", filePath], { cwd });
    }
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const msg = `Failed to discard ${filePath}: ${err.stderr || err.message}`;
    log(msg);
    vscode.window.showErrorMessage(msg);
  }
}

export async function stageAll(cwd: string) {
  try {
    log("Staging all changes");
    await execFileAsync(GIT_BIN, ["add", "."], { cwd });
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const msg = `Failed to stage all: ${err.stderr || err.message}`;
    log(msg);
    vscode.window.showErrorMessage(msg);
  }
}

export async function unstageAll(cwd: string) {
  try {
    log("Unstaging all changes");
    await execFileAsync(GIT_BIN, ["reset"], { cwd });
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const msg = `Failed to unstage all: ${err.stderr || err.message}`;
    log(msg);
    vscode.window.showErrorMessage(msg);
  }
}

export async function discardAll(cwd: string) {
  try {
    log("Discarding all changes");
    await execFileAsync(GIT_BIN, ["checkout", "."], { cwd });
    await execFileAsync(GIT_BIN, ["clean", "-fd"], { cwd });
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const msg = `Failed to discard all: ${err.stderr || err.message}`;
    log(msg);
    vscode.window.showErrorMessage(msg);
  }
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
        await execFileAsync(GIT_BIN, ["push"], { cwd });
      },
    );
    vscode.window.showInformationMessage("Successfully pushed to remote!");
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const msg = `Push failed: ${err.stderr || err.message}`;
    log(msg);
    vscode.window.showErrorMessage(msg);
  }
}

export async function executeGitCommit(
  commitMessage: string,
  authorDate: string,
  committerDate: string,
  targetCwd?: string,
) {
  try {
    // Basic date validation
    if (isNaN(Date.parse(authorDate.replace(" ", "T")))) {
      vscode.window.showErrorMessage("Invalid author date format.");
      return;
    }
    if (isNaN(Date.parse(committerDate.replace(" ", "T")))) {
      vscode.window.showErrorMessage("Invalid committer date format.");
      return;
    }

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
        await execFileAsync(GIT_BIN, ["commit", "-m", commitMessage], {
          cwd: root,
          env,
        });
      },
    );

    vscode.window.showInformationMessage(`Successfully backdated commit!`);
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const msg =
      err.stdout && err.stdout.includes("nothing to commit")
        ? "Nothing to commit. Check if you have staged changes."
        : `Commit failed: ${err.stderr || err.message}`;
    log(msg);
    vscode.window.showErrorMessage(msg);
  }
}
