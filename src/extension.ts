import axios from 'axios';
import * as crypto from 'crypto';
import * as vscode from 'vscode';

interface Task {
  title: string;
  checklist: string[];
  comment: string;
  cardId?: string;
  checklistId?: string;
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

    const includeFinal = await vscode.window.showQuickPick(['No', 'Yes'], {
      placeHolder: 'Include [FINAL] codeword to skip task creation?',
    });
    const finalTag = includeFinal === 'Yes' ? '[FINAL] ' : '';

    const checklistItems = checklistInput.split(',').map((item, index) => `${index + 1}.${item.trim()}`);
    const checklistText = checklistItems.join('\n');

    const snippet = `/* [RED] ${finalTag}trello task ${taskTitle}, checklist items\n${checklistText}\n*/`;
    editor.edit(editBuilder => {
      const position = editor.selection.active;
      editBuilder.insert(position, snippet);
    });

    vscode.window.showInformationMessage(`Trello task snippet inserted: ${taskTitle}`);
  });

  // onSave: Create Trello Tasks
  let onSaveDisposable: any = vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
    if (!document.fileName.endsWith('.ts')) {
      return;
    }

    const text = document.getText();
    const trelloCommentRegex = /\/\*\s*\[RED\]\s*(\[FINAL\]\s*)?trello task ([^,]+),\s*checklist items\s*([\s\S]*?)\s*\*\//g;
    let match;

    const currentTasks: Task[] = [];
    while ((match = trelloCommentRegex.exec(text)) !== null) {
      const hasFinal = !!match[1];
      const title = match[2].trim();
      const checklistRaw = match[3].trim();
      const checklist = checklistRaw
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.match(/^\d+\./)) // Ensure lines start with number
        .map(line => line.replace(/^\d+\./, '').trim());
      if (!hasFinal) {
        currentTasks.push({ title, checklist, comment: match[0] });
      }
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

      if (existingTask && existingTask.cardId) {
        // Skip if task already exists
        task.cardId = existingTask.cardId;
        task.checklistId = existingTask.checklistId;
        continue;
      }

      try {
        // Check for existing card with same title in list
        const cardsResponse = await axios.get(
          `https://api.trello.com/1/lists/${listId}/cards`,
          { params: { key: apiKey, token: apiToken } }
        );
        const existingCard = cardsResponse.data.find((card: any) => card.name === task.title);
        if (existingCard) {
          task.cardId = existingCard.id;
          const checklistsResponse = await axios.get(
            `https://api.trello.com/1/cards/${existingCard.id}/checklists`,
            { params: { key: apiKey, token: apiToken } }
          );
          task.checklistId = checklistsResponse.data[0]?.id;
          vscode.window.showInformationMessage(`Task already exists in Trello: ${task.title}`);
          continue;
        }

        // Create new card
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
    }

    // Commented out: Delete tasks for removed comments
    /*
    for (const prevTask of previousTasks) {
      const taskHash = crypto.createHash('md5').update(prevTask.comment).digest('hex');
      if (!currentTasks.some(ct => crypto.createHash('md5').update(ct.comment).digest('hex') === taskHash) && prevTask.cardId) {
        try {
          await axios.delete(
            `https://api.trello.com/1/cards/${prevTask.cardId}`,
            {
              params: { key: apiKey, token: apiToken },
            }
          );
          vscode.window.showInformationMessage(`Trello card deleted: ${prevTask.title}`);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to delete Trello card: ${error.message}`);
        }
      }
    }
    */

    storedTasks[fileKey] = currentTasks;
    await taskStorage.update('trelloTasks', storedTasks);
  });

  // Command: Create Trello Task from Comments
  let createTaskDisposable = vscode.commands.registerCommand('vscode-trello-custom.createTrelloTask', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor');
      return;
    }
    await onSaveDisposable.listener(editor.document);
  });

  context.subscriptions.push(insertSnippetDisposable, onSaveDisposable, createTaskDisposable);
}

export function deactivate() {}