package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/nanolabs/nanomonitor/agent/internal/tray"
	"github.com/nanolabs/nanomonitor/agent/internal/version"
)

func main() {
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

