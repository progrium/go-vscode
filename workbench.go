package vscode

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"net/http"

	_ "embed"

	"github.com/progrium/go-vscode/internal/zipfs"
	"github.com/progrium/go-vscode/product"
	"tractor.dev/toolkit-go/engine/fs/workingpathfs"
)

//go:embed vscode-web.zip
var vscodeZip []byte
var vscodeReader *zip.Reader

func init() {
	var err error
	vscodeReader, err = zip.NewReader(bytes.NewReader(vscodeZip), int64(len(vscodeZip)))
	if err != nil {
		panic(err)
	}
}

type Workbench struct {
	ProductConfiguration product.ProductConfiguration `json:"productConfiguration"`
}

func (wb *Workbench) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	mux := http.NewServeMux()
	mux.Handle("/workbench.json", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("content-type", "application/json")
		enc := json.NewEncoder(w)
		if err := enc.Encode(wb); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}))
	fsys := workingpathfs.New(zipfs.New(vscodeReader), "dist")
	mux.Handle("/", http.FileServerFS(fsys))
	mux.ServeHTTP(w, r)
}
