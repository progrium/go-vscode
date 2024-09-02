const extensionReady = new Promise((resolve) => {
    window.addEventListener("message", (event) => {
        const { data } = event;
        if (!data.from && !data.port) {
            return;
        }
        resolve(data.port);
    });
});

const websocketReady = new Promise((resolve) => {
    const ws = new WebSocket(`//${location.host}/bridge`)
    ws.onopen = (e) => {
        resolve(ws);
    };
});

Promise.all([websocketReady, extensionReady]).then(([ws, extPort]) => {
    ws.onmessage = async (event) => {
        const data = await blobToUint8Array(event.data);
        // console.log(">>", data);
        extPort.postMessage(data);
    }
    extPort.onmessage = (event) => {
        // console.log("<<", event.data);
        ws.send(event.data);
    }
    // console.log("bridged");
});

function blobToUint8Array(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function() {
            const arrayBuffer = reader.result;
            const uint8Array = new Uint8Array(arrayBuffer);
            resolve(uint8Array);
        };
        reader.onerror = function(error) {
            reject(error);
        };
        reader.readAsArrayBuffer(blob);
    });
}