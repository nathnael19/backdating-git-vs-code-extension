import * as vscode from "vscode";
import { setOutputChannel, log, executeGitCommit } from "./gitUtils";
import { BackdatingGitSidebarProvider } from "./sidebarProvider";

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Backdating Git");
  setOutputChannel(outputChannel);
  log("Extension activated");

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
