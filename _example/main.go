package main

import (
	"log"
	"net/http"

	"github.com/progrium/go-vscode"
	"github.com/progrium/go-vscode/product"
)

func main() {
	// fsys := os.DirFS(".")

	// cmd := exec.Command("/bin/sh")
	// tty, err := pty.Start(cmd)
	// if err != nil {
	// 	log.Fatal(err)
	// }

	wb := &vscode.Workbench{
		ProductConfiguration: product.ProductConfiguration{
			NameShort: "CustomEditor",
			NameLong:  "My Custom Editor",
			Version:   "example",
		},
	}

	log.Println("serving on :8089 ...")
	if err := http.ListenAndServe(":8089", wb); err != nil {
		log.Fatal(err)
	}

}
