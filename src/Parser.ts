import * as vscode from 'vscode';

export interface Waypoint {
    id: number;
    x: number;
    y: number;
    line: number;
    xStart: number;
    xEnd: number;
    yStart: number;
    yEnd: number;
}

export interface AutonRoutine {
    name: string;
    waypoints: Waypoint[];
}

export function parseAutonFile(text: string): AutonRoutine[] {
    const routines: AutonRoutine[] = [];
    const lines = text.split('\n');
    let idCounter = 0;

    const funcRegex = /void\s+([a-zA-Z0-9_]+)\s*\([^)]*\)/;
    const coordRegex = /(?:moveToPoint|moveToPose|setPose)\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)/g;
    
    let currentRoutine: AutonRoutine | null = null;
    let globalRoutineCounter = 1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Find function names to split paths
        const funcMatch = funcRegex.exec(line);
        if (funcMatch) {
            currentRoutine = { name: funcMatch[1], waypoints: [] };
            routines.push(currentRoutine);
        }

        let match;
        coordRegex.lastIndex = 0;
        
        const uncommentedLine = line.split('//')[0];
        
        while ((match = coordRegex.exec(uncommentedLine)) !== null) {
            if (!currentRoutine) {
                currentRoutine = { name: `Unnamed Routine ${globalRoutineCounter++}`, waypoints: [] };
                routines.push(currentRoutine);
            }

            const xStr = match[1];
            const yStr = match[2];

            const matchText = match[0];
            const xOffsetInMatch = matchText.indexOf(xStr);
            const xStart = match.index + xOffsetInMatch;
            const xEnd = xStart + xStr.length;
            
            const textAfterX = matchText.substring(xOffsetInMatch + xStr.length);
            const yOffsetRelative = textAfterX.indexOf(yStr);
            const yStart = xEnd + yOffsetRelative;
            const yEnd = yStart + yStr.length;

            currentRoutine.waypoints.push({
                id: ++idCounter,
                x: parseFloat(xStr),
                y: parseFloat(yStr),
                line: i,
                xStart,
                xEnd,
                yStart,
                yEnd
            });
        }
    }
    
    // Clean up empty routines
    return routines.filter(r => r.waypoints.length > 0);
}

// Bypasses dependency on activeTextEditor focus issues by using the guaranteed URI
export async function updateWaypoint(documentUri: vscode.Uri, waypoint: Waypoint, newX: number, newY: number): Promise<boolean> {
    const edit = new vscode.WorkspaceEdit();
    const xRange = new vscode.Range(new vscode.Position(waypoint.line, waypoint.xStart), new vscode.Position(waypoint.line, waypoint.xEnd));
    const yRange = new vscode.Range(new vscode.Position(waypoint.line, waypoint.yStart), new vscode.Position(waypoint.line, waypoint.yEnd));
    
    // Convert safe 3-decimal float back to minimal string
    const cleanX = parseFloat(newX.toFixed(3)).toString();
    const cleanY = parseFloat(newY.toFixed(3)).toString();

    edit.replace(documentUri, xRange, cleanX);
    edit.replace(documentUri, yRange, cleanY);
    
    return await vscode.workspace.applyEdit(edit);
}
