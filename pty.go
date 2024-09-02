package vscode

import (
	"io"
	"sync"

	"tractor.dev/toolkit-go/duplex/rpc"
)

func (api *bridge) Terminal(r rpc.Responder, c *rpc.Call) {
	c.Receive(nil)

	f, err := api.wb.MakePTY()
	if err != nil {
		r.Return(err)
		return
	}

	ch, err := r.Continue()
	if err != nil {
		panic(err)
	}

	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		io.Copy(ch, f)
		wg.Done()
	}()
	wg.Add(1)
	go func() {
		io.Copy(f, ch)
		wg.Done()
	}()

	wg.Wait()
	ch.Close()
}
