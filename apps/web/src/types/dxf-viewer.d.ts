declare module "dxf-viewer" {
  export default class DXFViewer {
    constructor(options?: any);
    load(data: string | ArrayBuffer): void;
    destroy(): void;
  }
}





