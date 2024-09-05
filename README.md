# go-vscode

VSCode as a Go library. Embed an editor in your Go programs.

Set up `vscode.Workbench` with a terminal factory and filesystem (both of which can be virtual), then you can serve it as an HTTP handler to access your custom VSCode editor in the browser. Use with a webview window library to give the editor its own native window.

```go
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

	log.Println("editor serving on :8080 ...")
	if err := http.ListenAndServe(":8080", wb); err != nil {
		log.Fatal(err)
	}

}

```

Let me know what else you'd like to customize from Go!

## Requires Git LFS

This Go module embeds a 17MB release artifact of [vscode-web](https://github.com/progrium/vscode-web) stored with Git LFS, which [doesn't quite work](https://github.com/golang/go/issues/47308) with `go get` seamlessly yet. 

You must have [Git LFS](https://git-lfs.com/) installed and you must also set `export GOPRIVATE=github.com/progrium/go-vscode` as a workaround before running `go mod tidy` or `go get github.com/progrium/go-vscode`. Otherwise your built project will panic with `zip: not a valid zip file`.

## License

MIT