import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";

const BASE = import.meta.env.BASE_URL;
const asset = (p: string) => `${BASE}${p.replace(/^\//, "")}`;

type Profile = {
  id: number;
  treeCode: string;
  variety: string | null;
  ancientStatus: string | null;
  estimatedAgeClass: string | null;
  crownDiameterM: number | null;
  crownAreaM2: number | null;
  currentHealthIndex: number | null;
  centroidLat: number | null;
  centroidLon: number | null;
  groveName: string | null;
  groveCode: string | null;
  photoCount: number;
  photos: Array<{
    id: number;
    fileUrl: string;
    thumbnailUrl: string | null;
    capturedAt: string | null;
  }>;
};

export default function PublicTreePage() {
  const [, params] = useRoute<{ id: string }>("/tree/:id");
  const id = params?.id ? Number(params.id) : null;
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id == null || !Number.isFinite(id)) return;
    let alive = true;
    setError(null);
    setData(null);
    fetch(`/api/public/trees/${id}`)
      .then((r) => {
        if (r.status === 404) throw new Error("This tree is not in our public registry.");
        if (!r.ok) throw new Error(`Server returned ${r.status}.`);
        return r.json();
      })
      .then((d: Profile) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <>
      <nav className="kog-nav">
        <Link href="/">
          <a className="kog-nav__brand">
            <img src={asset("ds/assets/khalaf-logo-color-transparent.png")} alt="Khalaf" />
            <div>
              <div className="b1">KHALAF</div>
              <div className="b2">Olive Groves · Tree dossier</div>
            </div>
          </a>
        </Link>
        <div className="kog-nav__links">
          <Link href="/"><a>Home</a></Link>
        </div>
      </nav>

      <div className="bt-page">
        {error && (
          <>
            <h1 className="bt-hero__title">Tree not found</h1>
            <p className="bt-hero__lede">{error}</p>
          </>
        )}
        {!error && !data && <p className="bt-hero__lede" style={{ fontStyle: "italic" }}>Loading tree dossier…</p>}
        {data && (
          <>
            <div className="bt-crumb">
              <span>Tree</span>
              <span className="sep" />
              <span style={{ color: "var(--ink)" }}>{data.treeCode}</span>
              <span className="sep" />
              <span>{data.groveName ?? "Khalaf grove"}</span>
            </div>
            <h1 className="bt-hero__title" style={{ marginTop: 12 }}>
              {data.treeCode}
              {data.ancientStatus && data.ancientStatus !== "none" && (
                <em> · {data.ancientStatus} ancient</em>
              )}
            </h1>
            <p className="bt-hero__lede">
              A {data.variety ?? "Souri"} olive tree on the{" "}
              {data.groveName ?? "Khalaf"} terrace above Rameh.
              {data.estimatedAgeClass ? ` Estimated age class: ${data.estimatedAgeClass}.` : ""}
            </p>

            <div className="bt-dossier__stats" style={{ marginTop: 24 }}>
              <div><div className="k">Variety</div><div className="v">{data.variety ?? "Souri"}</div></div>
              <div><div className="k">Ancient status</div><div className="v">{data.ancientStatus ?? "—"}</div></div>
              <div><div className="k">Estimated age</div><div className="v italic">{data.estimatedAgeClass ?? "—"}</div></div>
              <div><div className="k">Crown diameter</div><div className="v">{data.crownDiameterM != null ? `${data.crownDiameterM.toFixed(1)} m` : "—"}</div></div>
              <div><div className="k">Crown area</div><div className="v">{data.crownAreaM2 != null ? `${data.crownAreaM2.toFixed(0)} m²` : "—"}</div></div>
              <div><div className="k">Health index</div><div className="v italic">{data.currentHealthIndex != null ? `${Math.round(data.currentHealthIndex)} / 100` : "—"}</div></div>
            </div>

            {data.centroidLat != null && data.centroidLon != null && (
              <p style={{ marginTop: 18, fontFamily: "var(--font-sans)", fontSize: 12, letterSpacing: "0.12em", color: "var(--ink-mute)" }}>
                {data.centroidLat.toFixed(5)}°N · {data.centroidLon.toFixed(5)}°E
              </p>
            )}

            <h2 className="bt-sec__title" style={{ marginTop: 48 }}>
              Field photographs ({data.photoCount})
            </h2>
            {data.photos.length === 0 ? (
              <p style={{ fontStyle: "italic", color: "var(--ink-mute)" }}>No public photos for this tree yet.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginTop: 18 }}>
                {data.photos.map((p) => (
                  <a key={p.id} href={p.fileUrl} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                    <img
                      src={p.thumbnailUrl ?? p.fileUrl}
                      alt={`Field photo of ${data.treeCode}`}
                      style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 4 }}
                    />
                    {p.capturedAt && (
                      <div style={{ marginTop: 6, fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: "0.08em", color: "var(--ink-mute)" }}>
                        {new Date(p.capturedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                      </div>
                    )}
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
