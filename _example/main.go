package main

import (
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"

	"github.com/creack/pty"
	"github.com/progrium/go-vscode"
	"github.com/progrium/go-vscode/product"
	"tractor.dev/toolkit-go/engine/fs/osfs"
	"tractor.dev/toolkit-go/engine/fs/workingpathfs"
)

func main() {
	cwd, _ := os.Getwd()
	fsys := workingpathfs.New(osfs.New(), cwd)

	wb := &vscode.Workbench{
		ProductConfiguration: product.Configuration{
			NameLong: "My Custom Editor",
		},
		MakePTY: func() (io.ReadWriteCloser, error) {
			cmd := exec.Command("/bin/bash")
			return pty.Start(cmd)
		},
		FS: fsys,
	}

	log.Println("serving on :8080 ...")
	if err := http.ListenAndServe(":8080", wb); err != nil {
		log.Fatal(err)
	}

}
