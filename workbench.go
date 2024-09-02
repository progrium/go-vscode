package vscode

import (
	"archive/zip"
	"bytes"
	"embed"
	"encoding/json"
	"io"
	"net/http"

	_ "embed"

	"github.com/progrium/go-vscode/internal/zipfs"
	"github.com/progrium/go-vscode/product"
	"golang.org/x/net/websocket"
	"tractor.dev/toolkit-go/duplex/codec"
	"tractor.dev/toolkit-go/duplex/fn"
	"tractor.dev/toolkit-go/duplex/mux"
	"tractor.dev/toolkit-go/duplex/talk"
	"tractor.dev/toolkit-go/engine/fs"
	"tractor.dev/toolkit-go/engine/fs/workingpathfs"
)

//go:embed extension assets
var embedded embed.FS

var vscodeReader *zip.Reader

func init() {
	b, err := embedded.ReadFile("assets/vscode-web.zip")
	if err != nil {
		panic(err)
	}
	vscodeReader, err = zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		panic(err)
	}
}

type URIComponents struct {
	Scheme    string `json:"scheme"`
	Authority string `json:"authority,omitempty"`
	Path      string `json:"path,omitempty"`
	Query     string `json:"query,omitempty"`
	Fragment  string `json:"fragment,omitempty"`
}

type Workbench struct {
	ProductConfiguration        product.Configuration `json:"productConfiguration"`
	AdditionalBuiltinExtensions []URIComponents       `json:"additionalBuiltinExtensions,omitempty"`
	FolderURI                   *URIComponents        `json:"folderUri,omitempty"`

	FS      fs.FS                              `json:"-"`
	MakePTY func() (io.ReadWriteCloser, error) `json:"-"`
}

type bridge struct {
	wb *Workbench
}

func (wb *Workbench) ensureExtension(r *http.Request) {
	foundExtension := false
	for _, e := range wb.AdditionalBuiltinExtensions {
		if e.Path == "/extension" {
			foundExtension = true
			break
		}
	}
	if !foundExtension {
		wb.AdditionalBuiltinExtensions = append(wb.AdditionalBuiltinExtensions, URIComponents{
			Scheme:    "http",
			Authority: r.Host,
			Path:      "/extension",
		})
	}
}

func (wb *Workbench) ensureFolder() {
	if wb.FolderURI == nil {
		wb.FolderURI = &URIComponents{
			Scheme: "hostfs",
			Path:   "/",
		}
	}
}

func (wb *Workbench) handleBridge(conn *websocket.Conn) {
	conn.PayloadType = websocket.BinaryFrame
	sess := mux.New(conn)
	defer sess.Close()

	peer := talk.NewPeer(sess, codec.CBORCodec{})
	peer.Handle("vscode/", fn.HandlerFrom(&bridge{
		wb: wb,
	}))
	peer.Respond()
}

func (wb *Workbench) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	wb.ensureExtension(r)
	wb.ensureFolder()

	fsys := workingpathfs.New(zipfs.New(vscodeReader), "dist")
	mux := http.NewServeMux()
	mux.Handle("/bridge", websocket.Handler(wb.handleBridge))
	mux.Handle("/extension/", http.FileServerFS(embedded))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.ServeFileFS(w, r, embedded, "assets/index.html")
			return
		}

		if r.URL.Path == "/bridge.js" {
			http.ServeFileFS(w, r, embedded, "assets/bridge.js")
			return
		}

		if r.URL.Path == "/workbench.json" {
			w.Header().Add("content-type", "application/json")
			enc := json.NewEncoder(w)
			if err := enc.Encode(wb); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			return
		}

		http.FileServerFS(fsys).ServeHTTP(w, r)
	}))
	mux.ServeHTTP(w, r)
}
