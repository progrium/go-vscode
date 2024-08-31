# go-vscode

VSCode as a Go library. Embed an editor in your Go programs.

```go
package main

import (
	"log"
	"net/http"

	"github.com/progrium/go-vscode"
	"github.com/progrium/go-vscode/product"
)

func main() {
	wb := &vscode.Workbench{
		ProductConfiguration: product.ProductConfiguration{
			NameShort: "CustomEditor",
			NameLong:  "My Custom Editor",
			Version:   "example",
		},
	}

	log.Println("serving on :8080 ...")
	if err := http.ListenAndServe(":8080", wb); err != nil {
		log.Fatal(err)
	}

}

```

Although in the current state, this will give you VSCode on localhost:8080, but you
won't be able to edit files. I need to expose the filesystem and terminal that VSCode
uses, though they'll both be based on Go interfaces so they could be virtual.

Let me know what else you'd like to customize from Go!

## License

MIT