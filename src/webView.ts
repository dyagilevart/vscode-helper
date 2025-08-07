import * as vscode from 'vscode';

export class LumosWebviewProvider implements vscode.WebviewViewProvider {
    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: []
        };
        webviewView.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Lumos Developerum</title>
            </head>
            <body>
                <h1>✨ Your magical tools here!</h1>
            </body>
            </html>
        `;
    }
}