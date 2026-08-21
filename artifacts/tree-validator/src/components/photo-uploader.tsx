import { useRef, useState } from "react";
import { Camera, Loader2, ImagePlus } from "lucide-react";
import {
  finalizePhotoUpload,
  requestUploadUrl,
} from "@workspace/api-client-react";

type Props = {
  treeId: number;
  groveId: number | null;
  onUploaded: () => void;
};

export function PhotoUploader({ treeId, groveId, onUploaded }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const presigned = await requestUploadUrl({
          name: file.name,
          size: file.size,
          contentType: file.type || "image/jpeg",
        });
        const put = await fetch(presigned.uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type || "image/jpeg" },
          body: file,
        });
        if (!put.ok) throw new Error(`Upload failed (${put.status})`);
        await finalizePhotoUpload({
          objectPath: presigned.objectPath,
          originalFileName: file.name,
          contentType: file.type || "image/jpeg",
          fileSizeBytes: file.size,
          purpose: "general",
          treeId,
          groveId,
          zone: null,
          photoSide: null,
          reportType: "general",
          caption: null,
          linkedEntityType: null,
          linkedEntityId: null,
          analysisProvider: "auto",
        });
      }
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="tv-btn-primary"
          onClick={() => cameraRef.current?.click()}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Camera className="h-5 w-5 mr-2" /> Take photo
            </>
          )}
        </button>
        <button
          type="button"
          className="tv-btn-secondary"
          onClick={() => galleryRef.current?.click()}
          disabled={busy}
        >
          <ImagePlus className="h-5 w-5 mr-2" /> From gallery
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
