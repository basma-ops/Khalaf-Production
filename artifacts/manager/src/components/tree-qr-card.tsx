import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer, QrCode } from "lucide-react";

interface Props {
  treeId: number;
  treeCode: string;
  groveName?: string | null;
}

function buildTreeUrl(treeId: number): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const normBase = base.endsWith("/") ? base : `${base}/`;
  return `${window.location.origin}${normBase}trees/${treeId}`;
}

export function TreeQrCard({ treeId, treeCode, groveName }: Props) {
  const url = buildTreeUrl(treeId);

  function handlePrint() {
    const w = window.open("", "_blank", "noopener,noreferrer,width=420,height=560");
    if (!w) return;
    const svg = document.getElementById(`tree-qr-svg-${treeId}`)?.outerHTML ?? "";
    w.document.write(`<!doctype html><html><head><title>QR ${treeCode}</title>
      <style>
        @page { size: 80mm 100mm; margin: 6mm; }
        body { font-family: Georgia, "Times New Roman", serif; text-align: center; margin: 0; padding: 12mm; }
        .code { font-family: ui-monospace, Menlo, monospace; font-size: 22pt; font-weight: 700; margin: 8mm 0 2mm; }
        .grove { font-size: 11pt; color: #555; margin-bottom: 4mm; }
        .url { font-size: 8pt; color: #888; word-break: break-all; margin-top: 4mm; }
        svg { width: 60mm; height: 60mm; }
      </style></head><body>
      ${svg}
      <div class="code">${treeCode}</div>
      ${groveName ? `<div class="grove">${groveName}</div>` : ""}
      <div class="url">${url}</div>
      <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); };</script>
    </body></html>`);
    w.document.close();
  }

  return (
    <Card data-testid={`tree-qr-card-${treeId}`}>
      <CardContent className="pt-6 flex flex-col sm:flex-row items-center gap-6">
        <div className="bg-white p-3 rounded-md border">
          <QRCodeSVG
            id={`tree-qr-svg-${treeId}`}
            value={url}
            size={144}
            level="M"
            includeMargin={false}
          />
        </div>
        <div className="flex-1 min-w-0 space-y-2 text-center sm:text-left">
          <div className="flex items-center gap-2 text-xs text-muted-foreground tracking-widest uppercase justify-center sm:justify-start">
            <QrCode className="h-3 w-3" /> Tree QR Label
          </div>
          <div className="font-mono text-2xl font-bold">{treeCode}</div>
          {groveName && <div className="text-sm text-muted-foreground">{groveName}</div>}
          <div className="text-[11px] text-muted-foreground break-all">{url}</div>
          <div className="pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              data-testid={`button-print-tree-qr-${treeId}`}
            >
              <Printer className="h-4 w-4 mr-2" /> Print label
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
