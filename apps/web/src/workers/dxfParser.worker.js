import DxfParser from "dxf-parser";
self.onmessage = (event) => {
    try {
        const parser = new DxfParser();
        const result = parser.parseSync(event.data.source);
        self.postMessage({
            ok: true,
            dxf: result,
        });
    }
    catch (error) {
        self.postMessage({
            ok: false,
            error: String(error?.message || error),
        });
    }
};
