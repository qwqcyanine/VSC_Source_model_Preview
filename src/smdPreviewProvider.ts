import * as vscode from 'vscode';

/**
 * CustomReadonlyEditorProvider for .smd (and .dmx) files.
 *
 * Renders the model in a webview backed by a self-contained Three.js bundle
 * (media/viewer.js). The viewer reports { type: 'ready' } when its script is
 * up, and the provider responds by posting the document text back; parse +
 * render happen in the webview using the shared parser.
 */
export class SmdPreviewProvider implements vscode.CustomReadonlyEditorProvider {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly onDisposeDoc = new vscode.EventEmitter<void>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** Readonly editor: the document is only ever read (via openTextDocument below). */
  openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): vscode.CustomDocument {
    return {
      uri,
      dispose: () => this.onDisposeDoc.fire(),
    };
  }

  resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    const webview = webviewPanel.webview;
    const viewerUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'viewer.js')
    );
    const nonce = getNonce();

    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    };
    webview.html = this.getHtml(viewerUri, nonce);

    this.panels.set(document.uri.toString(), webviewPanel);
    webviewPanel.onDidDispose(() => {
      this.panels.delete(document.uri.toString());
    });

    webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'ready') {
        // CustomDocument carries no text; open the underlying text file.
        vscode.workspace.openTextDocument(document.uri).then((doc) => {
          this.postDocument(webviewPanel, doc);
        });
      }
    });
  }

  /** Push the current document contents to its panel, if one is open and visible. */
  update(document: vscode.TextDocument): void {
    const panel = this.panels.get(document.uri.toString());
    if (panel && panel.visible) {
      this.postDocument(panel, document);
    }
  }

  private postDocument(panel: vscode.WebviewPanel, document: vscode.TextDocument): void {
    const isDmx = document.fileName.toLowerCase().endsWith('.dmx');
    // Even for DMX we can parse safely (tolerant parser), but the viewer is told
    // to show a "not supported" overlay instead of rendering.
    let text = document.getText();
    if (isDmx) text = '';
    panel.webview.postMessage({ type: 'loadSmd', text, isDmx, fileName: document.fileName });
  }

  private getHtml(viewerUri: vscode.Uri, nonce: string): string {
    // Strict CSP: scripts allowed only via the nonce'd tag; no inline scripts,
    // no CDN. The viewer.js file itself is the only script.
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; img-src ${viewerUri.scheme} ${viewerUri.authority} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #1e1e1e; }
  #container { width: 100%; height: 100%; }
  #overlay {
    position: absolute; top: 0; left: 0; right: 0; z-index: 10;
    padding: 10px 14px; font-family: var(--vscode-editor-font-family, monospace);
    font-size: 13px; color: #f1c40f; background: rgba(0,0,0,0.75);
    white-space: pre-wrap; word-break: break-word;
  }
  #overlay.hidden { display: none; }
</style>
</head>
<body>
<div id="overlay" class="hidden"></div>
<div id="container"></div>
<script nonce="${nonce}" src="${viewerUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
