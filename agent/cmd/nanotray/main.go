package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"golang.org/x/sys/windows"

	"github.com/nanolabs/nanomonitor/agent/internal/tray"
	"github.com/nanolabs/nanomonitor/agent/internal/version"
)

var (
	kernel32Dll      = windows.NewLazySystemDLL("kernel32.dll")
	user32Dll        = windows.NewLazySystemDLL("user32.dll")
	getConsoleWindow = kernel32Dll.NewProc("GetConsoleWindow")
	showWindow       = user32Dll.NewProc("ShowWindow")
	freeConsole      = kernel32Dll.NewProc("FreeConsole")
)

// detachAndHideConsole ensures nanotray runs 100% headless with no console window
func detachAndHideConsole() {
	hwnd, _, _ := getConsoleWindow.Call()
	if hwnd != 0 {
		showWindow.Call(hwnd, 0) // SW_HIDE = 0
	}
	// Detach from parent console session so closing any parent cmd won't terminate nanotray
	freeConsole.Call()
}

func main() {
	detachAndHideConsole()

	var showVersion bool
	flag.BoolVar(&showVersion, "version", false, "Print version and exit")
	flag.BoolVar(&showVersion, "v", false, "Print version and exit")
	flag.Parse()

	if showVersion {
		fmt.Printf("NanoLabs Tray %s\n", version.Info())
		os.Exit(0)
	}

	app, err := tray.NewTrayApp()
	if err != nil {
		log.Fatalf("Failed to initialize tray app: %v", err)
		os.Exit(1)
	}

	if err := app.Run(); err != nil {
		log.Fatalf("Tray app error: %v", err)
		os.Exit(1)
	}
}
