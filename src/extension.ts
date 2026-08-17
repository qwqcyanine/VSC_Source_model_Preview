import * as vscode from 'vscode';
import { SmdPreviewProvider } from './smdPreviewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SmdPreviewProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('sourceModelPreview.smd', provider, {
      // Keep the WebGL context alive when the editor is hidden so the model
      // doesn't need re-rendering on every tab switch.
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Live update: when the underlying document changes and the preview panel is
  // visible, re-post the new text so the viewer re-renders.
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.contentChanges.length > 0) {
        provider.update(e.document);
      }
    })
  );
}

export function deactivate(): void {}
