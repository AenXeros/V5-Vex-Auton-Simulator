import * as vscode from 'vscode';
import { AutonPanel } from './AutonPanel';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('auton-visualizer.start', () => {
        AutonPanel.createOrShow(context.extensionUri);
    });
    context.subscriptions.push(disposable);
}

export function deactivate() {}
