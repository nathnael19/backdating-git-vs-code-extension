# Backdating Git

Create Git commits with custom backdated timestamps directly from VS Code.

## Features

- **Backdated Commits**: Specify both **Author Date** and **Committer Date** to rewrite history as needed.
- **Full-Featured Sidebar**: A dedicated Git GUI that mirrors the native VS Code experience:
  - **Staged vs. Changes**: Visual separation of your files.
  - **Interactive Actions**: Stage (`+`), Unstage (`-`), Discard (`↺`), and Open (`👁`) files.
  - **Status Badges**: Color-coded badges (**M**, **A**, **D**, **U**) for quick identification.
- **Push to Remote**: A one-click "Push" button to synchronize your backdated commits with GitHub/GitLab.
- **Date Presets**: Quick buttons for "Yesterday", "1 Week Ago", and "1 Month Ago".
- **Monorepo Support**: Robust repository discovery that finds `.git` folders even in nested subdirectories.
- **Logging**: A dedicated "Backdating Git" Output Channel for troubleshooting repository detection and Git commands.

## Installation

1. Download the `.vsix` file.
2. Open VS Code.
3. Go to the Extensions view (`Ctrl+Shift+X`).
4. Click the `...` (More Actions) menu in the top-right.
5. Select **Install from VSIX...** and choose the downloaded file.

## Usage

1. Open the **Backdating Git** icon in the Activity Bar.
2. Select or open a file in a Git repository.
3. Use the sidebar to stage your changes.
4. Enter a commit message.
5. Select a date using the picker or presets.
6. Click **Backdate Commit**.
7. Click **Push** to send your changes to the remote repository.

## Requirements

- [Git](https://git-scm.com/) must be installed and available in your system PATH.

## Extension Settings

This extension contributes the following commands:

- `backdating-git.commit`: Opens a quick input flow for backdating (Command Palette).

## License

MIT © 2026 Backdating Git Contributors
