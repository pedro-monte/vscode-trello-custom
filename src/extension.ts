import axios from 'axios';
import * as crypto from 'crypto';
import * as vscode from 'vscode';

interface Task {
  title: string;
  checklist: string[]; // Simplified to plain items
  comment: string;
  cardId?: string;
  checklistId?: string;
  deprecated?: boolean;
}

export function activate(context: vscode.ExtensionContext) {
  const taskStorage = context.globalState;

  // Command: Insert Trello Task Snippet
  let insertSnippetDisposable = vscode.commands.registerCommand('vscode-trello-custom.insertTrelloTaskSnippet', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor');
      return;
    }

    const taskTitle = await vscode.window.showInputBox({
      prompt: 'Enter Trello task title',
      placeHolder: 'e.g., Validate order total',
    });
    if (!taskTitle) {
      vscode.window.showInformationMessage('Task title is required');
      return;
    }

    const checklistInput = await vscode.window.showInputBox({
      prompt: 'Enter checklist items (comma-separated)',
      placeHolder: 'e.g., Validate product prices,Check shipping fee,Ensure total matches',
    });
    if (!checklistInput) {
      vscode.window.showInformationMessage('Checklist items are required');
      return;
    }

    const checklistItems = checklistInput.split(',').map((item, index) => `${index + 1}.${item.trim()}`);
    const checklistText = checklistItems.join('\n');

    const snippet = `/* [RED] trello task ${taskTitle}, checklist items\n${checklistText}\n*/`;
    editor.edit(editBuilder => {
      const position = editor.selection.active;
      editBuilder.insert(position, snippet);
    });

    vscode.window.showInformationMessage(`Trello task snippet inserted: ${taskTitle}`);
  });

  // Command: Sync Trello Changes to Comments
  let syncTrelloChangesDisposable = vscode.commands.registerCommand('vscode-trello-custom.syncTrelloChanges', async () => {
    const config = vscode.workspace.getConfiguration('vscode-trello-custom');
    const apiKey = config.get('apiKey');
    const apiToken = config.get('apiToken');
    const listId = config.get('listId');

    if (!apiKey || !apiToken || !listId) {
      vscode.window.showErrorMessage('Missing Trello API credentials or List ID in settings');
      return;
    }

    const storedTasks: { [file: string]: Task[] } = taskStorage.get('trelloTasks', {});
    for (const fileKey of Object.keys(storedTasks)) {
      const tasks = storedTasks[fileKey];
      const document = await vscode.workspace.openTextDocument(fileKey);
      if (!document) {continue;}

      let text = document.getText();
      for (const task of tasks) {
        if (task.deprecated || !task.cardId || !task.checklistId) {continue;}

        try {
          // Check if card is still in the specified list
          const cardResponse = await axios.get(
            `https://api.trello.com/1/cards/${task.cardId}`,
            { params: { key: apiKey, token: apiToken } }
          );
          if (cardResponse.data.idList !== listId) {
            task.deprecated = true;
            vscode.window.showInformationMessage(`Task marked as deprecated: ${task.title} (moved to another list)`);
            continue;
          }

          // Fetch checklist items
          const checklistResponse = await axios.get(
            `https://api.trello.com/1/checklists/${task.checklistId}/checkItems`,
            { params: { key: apiKey, token: apiToken } }
          );
          const trelloItems = checklistResponse.data;

          const checklistText = trelloItems.map((item: any, index: number) => `${index + 1}.${item.name}`).join('\n');

          const newComment = `/* [RED] trello task ${task.title}, checklist items\n${checklistText}\n*/`;
          const taskHash = crypto.createHash('md5').update(task.comment).digest('hex');
          const regex = new RegExp(`\\/\\*\\s*\\[RED\\]\\s*trello task ${task.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},\\s*checklist items[\\s\\S]*?\\*\\/`, 'g');

          if (text.includes(task.comment)) {
            text = text.replace(regex, newComment);
            task.comment = newComment;
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to sync Trello card: ${task.title}`);
          continue;
        }
      }

      const workspaceEdit = new vscode.WorkspaceEdit();
      workspaceEdit.replace(
        document.uri,
        new vscode.Range(0, 0, document.lineCount, 0),
        text
      );
      await vscode.workspace.applyEdit(workspaceEdit);
      await document.save();

      storedTasks[fileKey] = tasks;
      await taskStorage.update('trelloTasks', storedTasks);
    }

    vscode.window.showInformationMessage('Synced Trello changes to comments');
  });

  // onSave: Create Trello Tasks
  let onSaveDisposable: any = vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
    if (!document.fileName.endsWith('.ts')) {
      return;
    }

    const text = document.getText();
    const trelloCommentRegex = /\/\*\s*\[RED\]\s*trello task ([^,]+),\s*checklist items\s*([\s\S]*?)\s*\*\//g;
    let match;

    const currentTasks: Task[] = [];
    while ((match = trelloCommentRegex.exec(text)) !== null) {
      const title = match[1].trim();
      const checklist = match[2].split(/\n\s*\d+\./).slice(1).map(item => item.trim());
      currentTasks.push({ title, checklist, comment: match[0] });
    }

    const config = vscode.workspace.getConfiguration('vscode-trello-custom');
    const apiKey = config.get('apiKey');
    const apiToken = config.get('apiToken');
    const listId = config.get('listId');
    const redLabelId = config.get('redLabelId');

    if (!apiKey || !apiToken || !listId) {
      vscode.window.showErrorMessage('Missing Trello API credentials or List ID in settings');
      return;
    }

    const storedTasks: { [file: string]: Task[] } = taskStorage.get('trelloTasks', {});
    const fileKey = document.fileName;
    const previousTasks = storedTasks[fileKey] || [];

    for (const task of currentTasks) {
      const taskHash = crypto.createHash('md5').update(task.comment).digest('hex');
      const existingTask = previousTasks.find(pt => crypto.createHash('md5').update(pt.comment).digest('hex') === taskHash);

      if (existingTask?.deprecated) {
        continue;
      }

      if (!existingTask || !existingTask.cardId) {
        try {
          const cardResponse = await axios.post(
            `https://api.trello.com/1/cards`,
            {
              name: task.title,
              desc: `[RED] Created from VS Code: ${document.fileName}`,
              pos: 'bottom',
              idList: listId,
              idLabels: redLabelId ? [redLabelId] : [],
            },
            {
              params: { key: apiKey, token: apiToken },
            }
          );

          const cardId = cardResponse.data.id;
          task.cardId = cardId;

          const checklistResponse = await axios.post(
            `https://api.trello.com/1/checklists`,
            {
              name: 'Checklist',
              idCard: cardId,
              pos: 'bottom',
            },
            {
              params: { key: apiKey, token: apiToken },
            }
          );

          const checklistId = checklistResponse.data.id;
          task.checklistId = checklistId;

          for (const item of task.checklist) {
            await axios.post(
              `https://api.trello.com/1/checklists/${checklistId}/checkItems`,
              {
                name: item,
                pos: 'bottom',
              },
              { params: { key: apiKey, token: apiToken } }
            );
          }

          vscode.window.showInformationMessage(`Trello card created: ${task.title}`);
        } catch (error: any) {
          vscode.window.showErrorMessage(`Failed to create Trello card: ${error.message}`);
          continue;
        }
      } else {
        try {
          const cardResponse = await axios.get(
            `https://api.trello.com/1/cards/${existingTask.cardId}`,
            { params: { key: apiKey, token: apiToken } }
          );
          if (cardResponse.data.idList !== listId) {
            existingTask.deprecated = true;
            vscode.window.showInformationMessage(`Task marked as deprecated: ${task.title} (moved to another list)`);
            continue;
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to check Trello card: ${task.title}`);
          continue;
        }
      }
    }

    storedTasks[fileKey] = currentTasks;
    await taskStorage.update('trelloTasks', storedTasks);
  });

  // Command: Create Trello Task from Comments
  let createTaskDisposable:any = vscode.commands.registerCommand('vscode-trello-custom.createTrelloTask', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor');
      return;
    }
    await onSaveDisposable.listener(editor.document);
  });

  // Polling for Trello Updates
  const pollInterval = 60000;
  const pollTrello = async () => {
    await vscode.commands.executeCommand('vscode-trello-custom.syncTrelloChanges');
  };
  const interval = setInterval(pollTrello, pollInterval);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

  context.subscriptions.push(insertSnippetDisposable, syncTrelloChangesDisposable, onSaveDisposable, createTaskDisposable);
}

export function deactivate() {}