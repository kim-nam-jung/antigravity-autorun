import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { isWSL, toWSLPath } from '../utils/os';

const execAsync = promisify(child_process.exec);

export interface PathFinderResult {
    path: string | null;
    method: string;
    triedPaths: string[];
}

export async function findAntigravityPath(): Promise<PathFinderResult> {
    const triedPaths: string[] = [];
    
    // 1. Check user settings
    const config = vscode.workspace.getConfiguration('antigravityAutorun');
    const userPath = config.get<string>('antigravityPath', '').trim();
    if (userPath) {
        triedPaths.push(`[Setting] ${userPath}`);
        if (fs.existsSync(userPath)) {
            return { path: userPath, method: 'User Setting', triedPaths };
        }
    }

    // 2. Check runtime environment variables
    const envCandidates: string[] = [];
    if (process.env.LOCALAPPDATA) {
        envCandidates.push(`${process.env.LOCALAPPDATA}\\Programs\\Antigravity\\bin\\antigravity.cmd`);
        envCandidates.push(`${process.env.LOCALAPPDATA}\\Programs\\Antigravity\\Antigravity.exe`);
    }
    if (process.env.USERNAME) {
        envCandidates.push(`C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Programs\\Antigravity\\bin\\antigravity.cmd`);
    }
    if (process.env.USERPROFILE) {
        envCandidates.push(`${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Antigravity\\bin\\antigravity.cmd`);
        envCandidates.push(`${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe`);
    }

    for (const candidate of envCandidates) {
        triedPaths.push(`[Env] ${candidate}`);
        if (fs.existsSync(candidate)) {
            return { path: candidate, method: 'Environment Variable', triedPaths };
        }
    }

    // 3. Check WSL environment
    if (isWSL()) {
        try {
            const { stdout } = await execAsync('powershell.exe -Command "[Environment]::GetFolderPath(\'LocalApplicationData\')"');
            const localAppData = stdout.trim();
            process.env.LOCALAPPDATA = localAppData;
            const candidates = [
                `${localAppData}\\Programs\\Antigravity\\Antigravity.exe`,
                `${localAppData}\\Programs\\Antigravity\\bin\\antigravity.cmd`,
            ];
            for (const winPath of candidates) {
                const wslPath = toWSLPath(winPath);
                triedPaths.push(`[WSL] ${wslPath}`);
                if (fs.existsSync(wslPath)) {
                    return { path: winPath, method: 'WSL (powershell env)', triedPaths };
                }
            }
        } catch (e) {
            // Ignore WSL powershell env errors
        }

        try {
            const { stdout } = await execAsync('where.exe antigravity');
            const p = stdout.trim().split('\n')[0].trim();
            if (p) return { path: p, method: 'WSL (where.exe)', triedPaths };
        } catch (e) {
            // Ignore where.exe errors
        }
    }

    // 4. Check using 'where' command (Windows)
    if (process.platform === 'win32') {
        try {
            triedPaths.push(`[CMD] where antigravity`);
            const { stdout } = await execAsync('where antigravity', { shell: 'cmd.exe' });
            const paths = stdout.split('\n').map(p => p.trim()).filter(Boolean);
            for (const p of paths) {
                triedPaths.push(`[CMD Result] ${p}`);
                if (fs.existsSync(p)) {
                    return { path: p, method: 'Command Line (where)', triedPaths };
                }
            }
        } catch (e) {
            // 'where' command failed or not found
        }
    }

    return { path: null, method: 'Not Found', triedPaths };
}
