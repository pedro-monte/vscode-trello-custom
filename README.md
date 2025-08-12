# VSCode Trello Custom Extension

The **VSCode Trello Custom** extension integrates Visual Studio Code with Trello to streamline task management directly from code comments—tailored for TypeScript projects like the Orders module in your NestJS e-commerce system. Developers can insert structured `[RED]` comment blocks and automatically generate Trello tasks tied to a specific board and list.

---

## ✨ Features

- **Comment-Based Task Creation**: Generates Trello tasks from structured code comments.
- **Checklist Support**: Parses numbered items into Trello card checklists.
- **Red Label Styling**: Optionally adds a red label for easy visibility.
- **[FINAL] Codeword Support**: Skips task creation when `[FINAL]` is included.
- **Duplicate Prevention**: Checks existing card titles to avoid duplicates.
- **Non-Destructive**: Trello tasks persist even if comments are removed.
- **Command Palette Integration**: Insert snippets or manually trigger task creation.

---

## ✅ Prerequisites

- **VS Code**: Version 1.102.0+  
- **Node.js**: Version 16+  
- **Trello Account**: With access to your board: [Test Lab](https://trello.com/b/dsvQJuzH/test-lab)
- **Trello API Credentials**:
  - API Key: [Generate](https://trello.com/power-ups/admin)
  - API Token: [Generate](https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=your_api_key)
  - List ID (e.g., To Do)
  - Red Label ID (optional)

---

## ⚙️ Installation

### 1. Clone or Navigate

```bash
cd ~/CODE/vscode-trello-custom
# or clone
git clone <repository-url>
cd vscode-trello-custom
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Extension

```bash
npm run build
```

Ensure `dist/extension.js` is generated.

### 4. Package the Extension

```bash
npm install -g vsce
vsce package
```

Generates `vscode-trello-custom-0.0.1.vsix`.

### 5. Install Locally

```bash
code --install-extension vscode-trello-custom-0.0.1.vsix
```

---

## ⚙️ Configuration

In your **VS Code `settings.json`** (Ctrl+, > "Edit in settings.json"):

```json
{
  "vscode-trello-custom.apiKey": "your_api_key",
  "vscode-trello-custom.apiToken": "your_api_token",
  "vscode-trello-custom.listId": "your_list_id",
  "vscode-trello-custom.redLabelId": "your_red_label_id" // Optional
}
```

---

## 🔐 Getting Trello IDs

### List ID

```bash
curl -s "https://api.trello.com/1/boards/dsvQJuzH/lists?key=your_api_key&token=your_api_token" \
| jq '.[] | select(.name == "To Do") | .id'
```

### Red Label ID (optional)

```bash
curl -s "https://api.trello.com/1/boards/dsvQJuzH/labels?key=your_api_key&token=your_api_token" \
| jq '.[] | select(.color == "red") | .id'
```

---

## 🚀 Usage

### 1. Insert Trello Task Snippet

Open a `.ts` file and press:

```text
Ctrl+Shift+P > Insert Trello Task Snippet
```

Fill in:
- **Task Title**
- **Checklist Items** (comma-separated)
- **Include [FINAL]** (Yes to skip creation)

Example (with checklist):

```typescript
/* [RED] trello task Validate order total, checklist items
   1.Validate product prices
   2.Check shipping fee
   3.Ensure total matches
*/
```

Add `[FINAL]` to skip task creation:

```typescript
/* [RED] [FINAL] trello task Completed task, checklist items
   1.Verify payment
   2.Check stock
*/
```

---

### 2. Create Trello Tasks on Save

Just add a comment like:

```typescript
/* [RED] trello task Test guest order, checklist items
   1.Test null owner
   2.Validate shipping address
   3.Check total
*/
```

And save (`Ctrl+S`). The extension will:

- Create a Trello card in your configured list
- Add a red label (optional)
- Parse checklist items

---

### 3. Manual Task Creation

Run:

```text
Ctrl+Shift+P > Create Trello Task from Comments
```

This will scan the current `.ts` file for eligible `[RED]` blocks and create tasks.


