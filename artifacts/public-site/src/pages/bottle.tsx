import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";

const BASE = import.meta.env.BASE_URL;
const asset = (p: string) => `${BASE}${p.replace(/^\//, "")}`;

type Source = {
  oilBatchCode: string | null;
  litersDrawn: number;
  batchCode: string | null;
  seasonName: string | null;
  millName: string | null;
  pressingDelayHours: number | null;
  harvestDate: string | null;
  pressingStartedAt: string | null;
  pressingCompletedAt: string | null;
};

type GroveBreakdown = {
  groveName: string | null;
  groveCode: string | null;
  contributionKg: number;
  sharePct: number;
  treeCount: number;
};

type TopTree = {
  treeId: number;
  treeCode: string;
  groveName: string | null;
  variety: string | null;
  ancientStatus: string | null;
  estimatedAgeClass: string | null;
  crownDiameterM: number | null;
  contributionKg: number;
  sharePct: number;
  photoUrl: string | null;
};

type Lab = {
  sampleDate: string | null;
  labName: string | null;
  acidity: number | null;
  peroxideValue: number | null;
  totalPolyphenolsMgKg: number | null;
  k232: number | null;
  k270: number | null;
  isExtraVirgin: boolean | null;
  isHealthClaimEligible: boolean | null;
};

type Dossier = {
  bottlingRun: {
    runCode: string;
    bottledAt: string;
    label: string | null;
    lotCode: string | null;
    format: string | null;
    bottleSizeMl: number | null;
    bottlesProduced: number | null;
    totalLitersBottled: number | null;
    singleTree: boolean;
    singleGrove: boolean;
    status: string;
    publicToken: string;
  };
  sources: Source[];
  totalContributionKg: number;
  totalLitersDrawn: number;
  treeCount: number;
  groveBreakdown: GroveBreakdown[];
  topTrees: TopTree[];
  labResults: Lab[];
};

export default function BottlePage() {
  const [, params] = useRoute<{ token: string }>("/bottle/:token");
  const token = params?.token ?? "";
  const [data, setData] = useState<Dossier | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setError(null);
    setData(null);
    fetch(`/api/public/bottling-runs/${encodeURIComponent(token)}`)
      .then((r) => {
        if (r.status === 404) throw new Error("This bottle code does not match any of our bottling runs.");
        if (!r.ok) throw new Error(`Server returned ${r.status}.`);
        return r.json();
      })
      .then((d: Dossier) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    const prevTitle = document.title;
    const set = (name: string, content: string, attr: "name" | "property" = "name") => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
      return el;
    };
    let title = "Bottle traceability — Khalaf Olive Groves";
    let desc = "Trace this Khalaf bottle back to the trees and groves that gave its oil.";
    if (data) {
      const r = data.bottlingRun;
      const label = r.label ?? r.runCode;
      title = `${label} — Bottle traceability · Khalaf Olive Groves`;
      const groves = data.groveBreakdown.length;
      const trees = data.treeCount;
      desc = `Lot ${r.lotCode ?? r.runCode}, bottled ${r.bottledAt}. Oil from ${trees} olive tree${trees === 1 ? "" : "s"} across ${groves} grove${groves === 1 ? "" : "s"} above Rameh. View per-tree contributions, harvest dates, and lab quality.`;
    } else if (error) {
      title = "Bottle not found — Khalaf Olive Groves";
      desc = "This bottle code does not match a Khalaf bottling run.";
    }
    document.title = title;
    set("description", desc);
    set("og:title", title, "property");
    set("og:description", desc, "property");
    set("og:type", "article", "property");
    set("og:url", typeof window !== "undefined" ? window.location.href : "", "property");
    set("twitter:card", "summary");
    set("twitter:title", title);
    set("twitter:description", desc);
    return () => {
      document.title = prevTitle;
    };
  }, [data, error]);

  if (error) {
    return (
      <BottleShell>
        <div className="bt-page">
          <h1 className="bt-hero__title">Bottle not found</h1>
          <p className="bt-hero__lede">{error}</p>
          <Link href="/">
            <a className="kog-link">← Return to khalafolives.com</a>
          </Link>
        </div>
      </BottleShell>
    );
  }

  if (!data) {
    return (
      <BottleShell>
        <div className="bt-page">
          <p className="bt-hero__lede" style={{ fontStyle: "italic" }}>
            Tracing this bottle…
          </p>
        </div>
      </BottleShell>
    );
  }

  const run = data.bottlingRun;
  const acidity = data.labResults.find((l) => l.acidity != null)?.acidity ?? null;
  const polyphenols =
    data.labResults.find((l) => l.totalPolyphenolsMgKg != null)?.totalPolyphenolsMgKg ?? null;
  const peroxide = data.labResults.find((l) => l.peroxideValue != null)?.peroxideValue ?? null;
  const isEvoo = data.labResults.some((l) => l.isExtraVirgin);
  const isHealth = data.labResults.some((l) => l.isHealthClaimEligible);
  const sortedGroves = [...data.groveBreakdown].sort((a, b) => b.sharePct - a.sharePct);
  const sortedTrees = [...data.topTrees].sort((a, b) => b.sharePct - a.sharePct);
  const seasonName = data.sources.find((s) => s.seasonName)?.seasonName ?? "—";
  const mill = data.sources.find((s) => s.millName)?.millName ?? "Khalaf private mill, Rameh";
  const lede = run.singleTree
    ? "This bottle is the oil of a single ancient olive tree on the Khalaf family terraces above Rameh."
    : `This bottle was filled from ${data.treeCount} contributing trees across ${sortedGroves.length} family ${sortedGroves.length === 1 ? "grove" : "groves"} above Rameh — every kilo of fruit is accounted for below.`;

  return (
    <BottleShell>
      <section id="trace" style={{ background: "var(--bone)" }}>
        <div className="bt-page">
          <div className="bt-crumb">
            <span>Bottle</span>
            <span className="sep" />
            <span style={{ color: "var(--ink)" }}>{run.runCode}</span>
            <span className="sep" />
            <span>{run.singleTree ? "One tree · One bottle" : "Traceable bottling run"}</span>
          </div>

          <div className="bt-hero">
            <div className="bt-hero__photo">
              <div
                aria-label="Khalaf bottle"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `center/cover no-repeat url(${asset("ds/assets/bottle-hero.jpeg")})`,
                  filter: "brightness(0.95)",
                }}
              />
              <div className="bt-hero__verified">
                <span className="check">✓</span>
                <span>Authentic · {run.publicToken.slice(0, 12)}…</span>
              </div>
              <div className="bt-hero__plaque">
                <div className="l">Run</div>
                <div className="v">{run.runCode}</div>
              </div>
            </div>
            <div className="bt-hero__copy">
              <div className="bt-hero__eb">
                {run.label ?? "Khalaf single-grove bottling"} · Souri
              </div>
              <div className="bt-hero__meet">{run.singleTree ? "Meet" : "From"}</div>
              <h1 className="bt-hero__title">
                {run.label ?? "Khalaf Family Estate"}
                <br />
                <em>Lot {run.lotCode ?? run.runCode}.</em>
              </h1>
              <p className="bt-hero__lede">{lede}</p>
              <div className="bt-hero__specs">
                <div className="bt-hero__spec">
                  <div className="l">Bottled</div>
                  <div className="v italic">{formatDate(run.bottledAt)}</div>
                </div>
                <div className="bt-hero__spec">
                  <div className="l">Volume</div>
                  <div className="v">{run.bottleSizeMl ? `${run.bottleSizeMl} ml` : run.format ?? "—"}</div>
                </div>
                <div className="bt-hero__spec">
                  <div className="l">Bottles</div>
                  <div className="v">{run.bottlesProduced ?? "—"}</div>
                </div>
                <div className="bt-hero__spec">
                  <div className="l">Lot code</div>
                  <div className="v" style={{ fontSize: 14, fontFamily: "var(--font-sans)", letterSpacing: "0.16em" }}>
                    {run.lotCode ?? run.runCode}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section className="bt-sec">
            <div className="bt-sec__head">
              <div>
                <div className="bt-sec__eb">
                  <span className="bt-sec__num">01.</span>&nbsp; The grove breakdown
                </div>
                <h2 className="bt-sec__title">
                  {data.totalContributionKg.toFixed(0)} kg of olives across {sortedGroves.length} family {sortedGroves.length === 1 ? "grove" : "groves"}.
                </h2>
              </div>
              <div className="bt-sec__aside">{seasonName} · {data.treeCount} contributing trees</div>
            </div>
            <div className="bt-grove">
              <div className="bt-grove__panel">
                <h4>Origin breakdown</h4>
                <div className="sub">By weight of olives contributed</div>
                <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                  {sortedGroves.map((g) => (
                    <div key={g.groveCode ?? g.groveName ?? "u"}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-sans)", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        <span style={{ color: "var(--ink)" }}>{g.groveName ?? "Unattributed grove"}</span>
                        <span style={{ color: "var(--ink-mute)" }}>
                          {g.sharePct.toFixed(1)}% · {g.contributionKg.toFixed(0)} kg · {g.treeCount} {g.treeCount === 1 ? "tree" : "trees"}
                        </span>
                      </div>
                      <div style={{ marginTop: 6, height: 8, background: "rgba(92,107,61,0.15)", borderRadius: 2 }}>
                        <div
                          style={{
                            width: `${g.sharePct}%`,
                            height: "100%",
                            background: "var(--olive-deep, #5C6B3D)",
                            borderRadius: 2,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="bt-sec">
            <div className="bt-sec__head">
              <div>
                <div className="bt-sec__eb">
                  <span className="bt-sec__num">02.</span>&nbsp; Trees in this bottle
                </div>
                <h2 className="bt-sec__title">Top contributing trees on the terraces.</h2>
              </div>
              <div className="bt-sec__aside">Tap a tree for its dossier</div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 18,
                marginTop: 24,
              }}
            >
              {sortedTrees.map((t) => (
                <Link key={t.treeId} href={`/tree/${t.treeId}`}>
                  <a
                    className="kog-tree"
                    style={{ display: "block", textDecoration: "none", color: "inherit" }}
                    data-testid={`link-tree-${t.treeId}`}
                  >
                    <div className="kog-tree__crown" style={{ aspectRatio: "1.5", overflow: "hidden", background: "rgba(92,107,61,0.08)" }}>
                      {t.photoUrl ? (
                        <img src={t.photoUrl} alt={t.treeCode} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontStyle: "italic", color: "var(--ink-mute)", fontSize: 12 }}>
                          No photo
                        </div>
                      )}
                    </div>
                    <div className="kog-tree__body">
                      <div className="kog-tree__code">{t.treeCode}</div>
                      <div className="kog-tree__name">{t.groveName ?? "—"}</div>
                      <div className="kog-tree__variety">
                        {t.variety ?? "Souri"}
                        {t.ancientStatus && t.ancientStatus !== "none" ? ` · ${t.ancientStatus}` : ""}
                      </div>
                      <div className="kog-tree__row">
                        <div>
                          <div className="k">Share</div>
                          <div className="v">{t.sharePct.toFixed(2)}%</div>
                        </div>
                        <div>
                          <div className="k">Contributed</div>
                          <div className="v">{t.contributionKg.toFixed(1)} kg</div>
                        </div>
                      </div>
                    </div>
                  </a>
                </Link>
              ))}
            </div>
          </section>

          <section className="bt-sec">
            <div className="bt-sec__head">
              <div>
                <div className="bt-sec__eb">
                  <span className="bt-sec__num">03.</span>&nbsp; Pressed at
                </div>
                <h2 className="bt-sec__title">From terrace to mill, in hours.</h2>
              </div>
              <div className="bt-sec__aside">{mill}</div>
            </div>
            <div className="bt-tl">
              {data.sources.map((s, i) => {
                const harvest = s.harvestDate ? new Date(s.harvestDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
                const pressed = s.pressingStartedAt ? new Date(s.pressingStartedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
                return (
                  <div className="bt-tl__step" key={i}>
                    <div className="when">{harvest ?? s.seasonName ?? "—"}</div>
                    <h4>Pressing source #{i + 1}</h4>
                    <p>
                      {s.litersDrawn.toFixed(2)} L drawn from oil batch {s.oilBatchCode ?? "—"}
                      {s.batchCode ? ` (harvest batch ${s.batchCode})` : ""}.
                    </p>
                    <div className="meta" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span>{s.millName ?? "Khalaf private mill"}</span>
                      {harvest && <span>Picked: {harvest}</span>}
                      {pressed && <span>Pressed: {pressed}{s.pressingDelayHours != null ? ` · ${s.pressingDelayHours.toFixed(1)} h after picking` : ""}</span>}
                      {!pressed && s.pressingDelayHours != null && (
                        <span>Pressed {s.pressingDelayHours.toFixed(1)} h after picking</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {data.sources.length === 0 && (
                <div className="bt-tl__step">
                  <div className="when">—</div>
                  <h4>Pressing details unavailable</h4>
                  <p>This bottling run has no recorded oil sources yet.</p>
                </div>
              )}
            </div>
          </section>

          <section className="bt-sec">
            <div className="bt-sec__head">
              <div>
                <div className="bt-sec__eb">
                  <span className="bt-sec__num">04.</span>&nbsp; Lab analysis
                </div>
                <h2 className="bt-sec__title">The numbers behind this lot's oil.</h2>
              </div>
              <div className="bt-sec__aside">
                {data.labResults.length > 0 ? `${data.labResults.length} lab result${data.labResults.length === 1 ? "" : "s"} on file` : "Pending lab analysis"}
              </div>
            </div>

            <div className="bt-lab">
              <div className="bt-lab__head">
                <h4>Quality panel · lot {run.lotCode ?? run.runCode}</h4>
                <div className="badge">
                  {isEvoo ? "Extra Virgin · IOC standards" : "Quality data on file"}
                  {isHealth ? " · EU Health-claim eligible" : ""}
                </div>
              </div>
              <div className="bt-lab__grid">
                <LabCell k="Free acidity" v={fmt(acidity)} u="%" hint="EVOO limit ≤ 0.8%" fill={acidity != null ? Math.min(1, acidity / 0.8) : null} />
                <LabCell k="Peroxide value" v={fmt(peroxide)} u="meq O₂/kg" hint="EVOO limit ≤ 20" fill={peroxide != null ? Math.min(1, peroxide / 20) : null} />
                <LabCell k="Polyphenols" v={fmt(polyphenols, 0)} u="mg/kg" hint="≥ 250 mg/kg = EU 432/2012 health-claim eligible" fill={polyphenols != null ? Math.min(1, polyphenols / 600) : null} />
              </div>
              {data.labResults.length === 0 && (
                <p style={{ marginTop: 14, fontStyle: "italic", color: "var(--ink-mute)" }}>
                  No lab results have been published for this lot yet.
                </p>
              )}
            </div>
          </section>

          <section className="bt-actions">
            <div className="bt-action">
              <div className="l">Share</div>
              <div className="v">Send this bottle to a friend</div>
              <div className="h">Copies a link to this bottle's page.</div>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(window.location.href)}
                className="arr"
                style={{ background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer" }}
              >
                Copy link →
              </button>
            </div>
            <div className="bt-action">
              <div className="l">Visit</div>
              <div className="v">Walk these terraces with us</div>
              <div className="h">Small group visits during pressing season.</div>
              <a href="mailto:hello@khalafolives.com" className="arr">Plan a visit →</a>
            </div>
          </section>
        </div>
      </section>
    </BottleShell>
  );
}

function LabCell({ k, v, u, hint, fill }: { k: string; v: string; u: string; hint: string; fill: number | null }) {
  return (
    <div className="bt-lab__item">
      <div className="k">{k}</div>
      <div className="v">
        {v}
        {u && <small>{u}</small>}
      </div>
      {fill != null && (
        <div
          className="gauge"
          role="progressbar"
          aria-label={`${k}: ${v}${u}`}
          aria-valuenow={Math.round(fill * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="fill" style={{ width: `${fill * 100}%` }} />
          <div className="max" style={{ left: "100%" }} />
        </div>
      )}
      <div className="h">{hint}</div>
    </div>
  );
}

function fmt(n: number | null, digits = 2): string {
  return n != null ? n.toFixed(digits) : "—";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function BottleShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="kog-nav">
        <Link href="/">
          <a className="kog-nav__brand">
            <img src={asset("ds/assets/khalaf-logo-color-transparent.png")} alt="Khalaf" />
            <div>
              <div className="b1">KHALAF</div>
              <div className="b2">Olive Groves · Bottle traceability</div>
            </div>
          </a>
        </Link>
        <div className="kog-nav__links">
          <Link href="/"><a>Home</a></Link>
          <Link href="/#trace"><a>How it works</a></Link>
        </div>
        <a href="https://khalafolives.com" target="_blank" rel="noreferrer">
          <button className="kog-nav__cta">Shop the oil</button>
        </a>
      </nav>
      {children}
    </>
  );
}
