package main

import (
	"log"
	"os"

	"github.com/nanolabs/nanomonitor/agent/internal/tray"
)

func main() {
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
