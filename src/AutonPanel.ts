import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseAutonFile, updateWaypoint, Waypoint } from './Parser';

export class AutonPanel {
    public static currentPanel: AutonPanel | undefined;
    public static readonly viewType = 'autonVisualizer';
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    
    // Used to debug what exactly the tool crashes on or tries to do
    private static _outputChannel: vscode.OutputChannel | undefined;

    // Cache the most recent valid cpp file we were looking at!
    private _targetDocumentUri: vscode.Uri | undefined;
    private _currentWaypoints: Waypoint[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.webview.html = this._getHtmlForWebview();
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'updateWaypoint':
                        await this._handleUpdateWaypoint(message.id, message.x, message.y);
                        return;
                }
            },
            null,
            this._disposables
        );

        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && (editor.document.languageId === 'cpp' || editor.document.languageId === 'c')) {
                this._update();
            }
        }, null, this._disposables);

        vscode.workspace.onDidChangeTextDocument((e) => {
            if (this._targetDocumentUri && e.document.uri.toString() === this._targetDocumentUri.toString()) {
                this._update(e.document);
            }
        }, null, this._disposables);
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.One;
        
        if (AutonPanel.currentPanel) {
            AutonPanel.currentPanel._panel.reveal(column);
            return;
        }

        if (!AutonPanel._outputChannel) {
            AutonPanel._outputChannel = vscode.window.createOutputChannel("Auton Visualizer Log");
        }
        AutonPanel._outputChannel.show(true);
        AutonPanel._outputChannel.appendLine("Extension started up...");

        const panel = vscode.window.createWebviewPanel(
            AutonPanel.viewType,
            'VEX Auton Visualizer',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'Image')
                ]
            }
        );

        AutonPanel.currentPanel = new AutonPanel(panel, extensionUri);
    }

    private _update(document?: vscode.TextDocument) {
        const activeDoc = document || (vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document : null);
        
        if (activeDoc && (activeDoc.languageId === 'cpp' || activeDoc.languageId === 'c')) {
            this._targetDocumentUri = activeDoc.uri;
            const routines = parseAutonFile(activeDoc.getText());
            this._currentWaypoints = routines.flatMap(r => r.waypoints);
            this._panel.webview.postMessage({ command: 'loadRoutines', routines });
            AutonPanel._outputChannel?.appendLine(`[Sync] Loaded file ${activeDoc.uri.fsPath}`);
        } else if (!this._targetDocumentUri) {
            AutonPanel._outputChannel?.appendLine(`[Warning] Attempted to load but no C++ file was located.`);
            this._panel.webview.postMessage({ command: 'loadRoutines', routines: [] });
        }
    }

    private async _handleUpdateWaypoint(waypointId: number, newX: number, newY: number) {
        AutonPanel._outputChannel?.appendLine(`\n[Action - Apply Edit] Request ID #${waypointId} | New Point: (${newX}, ${newY})`);
        
        if (!this._targetDocumentUri) {
            AutonPanel._outputChannel?.appendLine(`[Error] Edit failed: No active tracking text document URI.`);
            vscode.window.showErrorMessage('No Active Source File Connected!');
            return;
        }

        const waypoint = this._currentWaypoints.find(w => w.id === waypointId);
        if (!waypoint) {
            AutonPanel._outputChannel?.appendLine(`[Error] Edit failed: Cannot find waypoint ID ${waypointId} inside memory array bounds!`);
            vscode.window.showErrorMessage('Failed to find matching waypoint. Sync error.');
            return;
        }

        AutonPanel._outputChannel?.appendLine(`[Action] Intercepting text on line ${waypoint.line + 1} | X char offsets [${waypoint.xStart}->${waypoint.xEnd}] | Y char offsets [${waypoint.yStart}->${waypoint.yEnd}]`);
        const success = await updateWaypoint(this._targetDocumentUri, waypoint, newX, newY);
        
        if (!success) {
            AutonPanel._outputChannel?.appendLine(`[Error] VS Code workspace edit returned false. Range mapping failure or Document Locked.`);
            vscode.window.showErrorMessage('Workspace Edit Failed!');
        } else {
            AutonPanel._outputChannel?.appendLine(`[Success] Changes safely injected to URI.`);
        }
    }

    public dispose() {
        AutonPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }

    private _getHtmlForWebview() {
        const indexHtmlPath = path.join(this._extensionUri.fsPath, 'media', 'index.html');
        let html = fs.readFileSync(indexHtmlPath, 'utf-8');
        
        const imagePathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'Image', 'image.png');
        const imageUri = this._panel.webview.asWebviewUri(imagePathOnDisk);
        
        return html.replace('{{FIELD_IMAGE_URI}}', imageUri.toString());
    }
}
