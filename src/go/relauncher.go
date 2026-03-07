package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

// Win32 API Definitions for process enumeration
var (
	modkernel32                  = syscall.NewLazyDLL("kernel32.dll")
	procCreateToolhelp32Snapshot = modkernel32.NewProc("CreateToolhelp32Snapshot")
	procProcess32First           = modkernel32.NewProc("Process32FirstW")
	procProcess32Next            = modkernel32.NewProc("Process32NextW")
)

const (
	TH32CS_SNAPPROCESS = 0x00000002
	MAX_PATH           = 260
	CREATE_NEW_CONSOLE = 0x00000010
	DETACHED_PROCESS   = 0x00000008
)

type PROCESSENTRY32 struct {
	Size            uint32
	Usage           uint32
	ProcessID       uint32
	DefaultHeapID   uintptr
	ModuleID        uint32
	Threads         uint32
	ParentProcessID uint32
	PriClassBase    int32
	Flags           uint32
	ExeFile         [MAX_PATH]uint16
}

func getAntigravityPID() uint32 {
	handle, _, _ := procCreateToolhelp32Snapshot.Call(TH32CS_SNAPPROCESS, 0)
	if handle == uintptr(syscall.InvalidHandle) {
		return 0
	}
	defer syscall.CloseHandle(syscall.Handle(handle))

	var pe32 PROCESSENTRY32
	pe32.Size = uint32(unsafe.Sizeof(pe32))

	ret, _, _ := procProcess32First.Call(handle, uintptr(unsafe.Pointer(&pe32)))
	if ret == 0 {
		return 0
	}

	for {
		exeName := syscall.UTF16ToString(pe32.ExeFile[:])
		if strings.HasPrefix(strings.ToLower(exeName), "antigravity") {
			return pe32.ProcessID
		}
		ret, _, _ = procProcess32Next.Call(handle, uintptr(unsafe.Pointer(&pe32)))
		if ret == 0 {
			break
		}
	}
	return 0
}

func logmsg(msg string) {
	tmpData := filepath.Join(os.TempDir(), "antigravity_relaunch.log")
	f, err := os.OpenFile(tmpData, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err == nil {
		f.WriteString(fmt.Sprintf("[%s] [GO] %s\n", time.Now().Format(time.RFC3339), msg))
		f.Close()
	}
}

func getCleanEnv() []string {
	var clean []string
	for _, env := range os.Environ() {
		upper := strings.ToUpper(env)
		if strings.HasPrefix(upper, "VSCODE_") ||
			strings.HasPrefix(upper, "ELECTRON_") ||
			strings.HasPrefix(upper, "NPM_") ||
			strings.HasPrefix(upper, "NODE_") {
			continue
		}
		clean = append(clean, env)
	}
	return clean
}

func main() {
	if len(os.Args) < 2 {
		logmsg("No executable path provided")
		os.Exit(1)
	}

	exePath := os.Args[1]

	// WSL Path Translation Check
	// If the path starts with /mnt/c/ (common in WSL), convert it to C:\
	if strings.HasPrefix(exePath, "/mnt/") && len(exePath) >= 7 {
		driveLetter := strings.ToUpper(string(exePath[5]))
		// Create Windows path: C:\...
		winPath := driveLetter + ":" + strings.ReplaceAll(exePath[6:], "/", "\\")
		logmsg(fmt.Sprintf("Translated WSL path %s to Windows path %s", exePath, winPath))
		exePath = winPath
	}

	args := []string{exePath}
	if len(os.Args) > 2 {
		args = append(args, os.Args[2:]...)
	}

	logmsg(fmt.Sprintf("Starting Go relauncher sequence for %s", exePath))

	time.Sleep(1 * time.Second) // Give the parent process time to gracefully shutdown

	logmsg("Waiting for Antigravity processes to close...")
	for i := 0; i < 20; i++ {
		pid := getAntigravityPID()
		if pid == 0 {
			break
		}
		time.Sleep(250 * time.Millisecond)
	}

	logmsg("Antigravity is completely closed. Starting new instance with detached Win32 API Clean Environment.")

	// Clean Environment Variables
	sysAttr := &syscall.SysProcAttr{
		CreationFlags: DETACHED_PROCESS,
	}

	attr := &os.ProcAttr{
		Dir:   filepath.Dir(exePath),
		Env:   getCleanEnv(),
		Files: []*os.File{nil, nil, nil}, // No IO
		Sys:   sysAttr,
	}

	proc, err := os.StartProcess(exePath, args, attr)
	if err != nil {
		logmsg(fmt.Sprintf("Failed to launch process: %v", err))
		os.Exit(1)
	}

	proc.Release()

	logmsg(fmt.Sprintf("Process started successfully with Clean Env. PID: %d", proc.Pid))
}
