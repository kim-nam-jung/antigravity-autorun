import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as osUtils from './os';
import * as fs from 'fs';

vi.mock('fs');

describe('OS Utilities', () => {
    describe('isWSL', () => {
        let originalPlatform: string;
        
        beforeAll(() => {
            originalPlatform = process.platform;
        });
        
        afterAll(() => {
            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });
        
        it('should return false if not on linux', () => {
            Object.defineProperty(process, 'platform', { value: 'win32' });
            expect(osUtils.isWSL()).toBe(false);
        });

        it('should return true if on linux and version contains microsoft', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            vi.mocked(fs.readFileSync).mockReturnValueOnce('Linux version 5.15.153.1-microsoft-standard-WSL2');
            expect(osUtils.isWSL()).toBe(true);
        });

        it('should return false if on linux but version does not contain microsoft', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            vi.mocked(fs.readFileSync).mockReturnValueOnce('Linux version 6.8.0-generic');
            expect(osUtils.isWSL()).toBe(false);
        });
        
        it('should return false if reading /proc/version throws', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
                throw new Error('File not found');
            });
            expect(osUtils.isWSL()).toBe(false);
        });
    });

    describe('toWSLPath', () => {
        it('should correctly convert a Windows drive path to a WSL path', () => {
            expect(osUtils.toWSLPath('C:\\Users\\name\\file.txt')).toBe('/mnt/c/Users/name/file.txt');
            expect(osUtils.toWSLPath('D:\\Data\\Project')).toBe('/mnt/d/Data/Project');
        });
        
        it('should handle paths with mixed slashes correctly after drive conversion', () => {
            expect(osUtils.toWSLPath('C:\\Program Files/Folder')).toBe('/mnt/c/Program Files/Folder');
        });
    });

    describe('getWindowsHost', () => {
        it('should return the IP from /etc/resolv.conf if nameserver is present', () => {
            vi.mocked(fs.readFileSync).mockReturnValueOnce('search foo.local\nnameserver 172.18.224.1\noptions ndots:1');
            expect(osUtils.getWindowsHost()).toBe('172.18.224.1');
        });

        it('should return 127.0.0.1 if resolv.conf does not contain nameserver with IP', () => {
            vi.mocked(fs.readFileSync).mockReturnValueOnce('search foo.local\noptions ndots:1');
            expect(osUtils.getWindowsHost()).toBe('127.0.0.1');
        });

        it('should return 127.0.0.1 if reading /etc/resolv.conf throws', () => {
            vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
                throw new Error('Access denied');
            });
            expect(osUtils.getWindowsHost()).toBe('127.0.0.1');
        });
    });
});
