import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL;
const asset = (p: string) => `${BASE}${p.replace(/^\//, "")}`;

type GroveStatus = {
  heritage: { founded: number; generations: number; origin: string; cultivar: string };
  stats: {
    totalTrees: number;
    totalGroves: number;
    totalAreaHa: number;
    documentedPhotos: number;
    bottlingRuns: number;
    averageHealthIndex: number | null;
  };
  lastUpdated: string;
};

type Grove = {
  id: number;
  code: string;
  name: string;
  areaHa: number | null;
  treeCount: number;
};

type FeaturedTree = {
  id: number;
  treeCode: string;
  groveName: string | null;
  crownDiameterM: number | null;
  currentHealthIndex: number | null;
};

function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => alive && setData(d as T))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);
  return data;
}

function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setSeen(true);
            io.disconnect();
          }
        });
      },
      { threshold },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [threshold, seen]);
  return { ref, seen };
}

function TreeCrownSVG({ crownPx }: { crownPx: number }) {
  return (
    <svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="20" y1="125" x2="180" y2="125" stroke="rgba(17,17,17,0.18)" strokeWidth="0.6" strokeDasharray="2 3" />
      <path
        d="M 100 125 C 96 110 102 95 99 80 C 97 70 103 65 100 50"
        stroke="#5C6B3D"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="100" cy="55" rx={crownPx * 0.85} ry={crownPx * 0.55} fill="#8A9968" opacity="0.55" />
      <ellipse cx="100" cy="50" rx={crownPx * 0.65} ry={crownPx * 0.42} fill="#5C6B3D" opacity="0.65" />
      <ellipse cx="92" cy="62" rx={crownPx * 0.45} ry={crownPx * 0.32} fill="#B8C29A" opacity="0.85" />
      <line x1={100 - crownPx * 0.85} y1="115" x2={100 + crownPx * 0.85} y2="115" stroke="#3D4727" strokeWidth="0.8" />
      <line x1={100 - crownPx * 0.85} y1="112" x2={100 - crownPx * 0.85} y2="118" stroke="#3D4727" strokeWidth="0.8" />
      <line x1={100 + crownPx * 0.85} y1="112" x2={100 + crownPx * 0.85} y2="118" stroke="#3D4727" strokeWidth="0.8" />
    </svg>
  );
}

function TraceabilitySection() {
    const [token, setToken] = useState("");
    return (
      <section id="trace" style={{ background: "var(--bone)" }}>
        <div className="bt-page">
          <div className="bt-crumb">
            <span>Traceability</span>
            <span className="sep" />
            <span style={{ color: "var(--ink)" }}>Find your bottle's story</span>
          </div>

          <div className="bt-hero">
            <div className="bt-hero__copy">
              <div className="bt-hero__eb">One bottle · One story</div>
              <div className="bt-hero__meet">Trace</div>
              <h1 className="bt-hero__title">
                Every bottle, back to the trees
                <br />
                <em>that gave its oil.</em>
              </h1>
              <p className="bt-hero__lede">
                Each Khalaf bottling run is recorded — the trees that contributed olives, the
                groves they grow on, the press, and the lab quality numbers. Scan the QR on
                your bottle, or enter your bottle's token below to see the full dossier.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = token.trim();
                  if (!t) return;
                  window.location.href = `${BASE}bottle/${encodeURIComponent(t)}`;
                }}
                style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}
              >
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Bottle token (e.g. abcd-1234-ef)"
                  aria-label="Bottle token"
                  style={{
                    flex: "1 1 260px",
                    padding: "12px 14px",
                    border: "1px solid rgba(17,17,17,0.2)",
                    borderRadius: 4,
                    fontFamily: "var(--font-sans)",
                    fontSize: 14,
                    background: "var(--bone)",
                    color: "var(--ink)",
                  }}
                />
                <button type="submit" className="kog-btn">Open my bottle's story →</button>
              </form>
              <div style={{ marginTop: 18, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--ink-mute)", letterSpacing: "0.06em" }}>
                No token to hand? Each bottle's back label carries a QR code that opens the same page directly.
              </div>
            </div>
            <div className="bt-hero__copy">
              <div className="bt-hero__eb">What you'll see</div>
              <ul style={{ marginTop: 14, paddingLeft: 0, listStyle: "none", fontFamily: "var(--font-serif)", fontSize: 16, lineHeight: 1.8, color: "var(--ink)" }}>
                <li>· The exact contributing trees and their share of your bottle.</li>
                <li>· The groves and harvest events behind the lot.</li>
                <li>· Lab quality numbers (acidity, polyphenols) and EVOO eligibility.</li>
                <li>· A printable certificate, signed by the family.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    );
  }
  

export default function Home() {
  const status = useFetch<GroveStatus>("/api/public/grove-status");
  const groves = useFetch<Grove[]>("/api/public/groves");
  const featured = useFetch<FeaturedTree[]>("/api/public/featured-trees");

  const founded = status?.heritage.founded ?? 1862;
  const yearsTradition = new Date().getFullYear() - founded;

  const sortedGroves = (groves ?? []).slice().sort((a, b) => b.treeCount - a.treeCount);
  const maxTrees = sortedGroves.length ? Math.max(...sortedGroves.map((g) => g.treeCount)) : 1;

  const featuredSorted = (featured ?? []).slice(0, 8);
  const maxCrown = featuredSorted.length
    ? Math.max(...featuredSorted.map((t) => t.crownDiameterM ?? 0)) || 1
    : 1;

  const fmtUpdated = status
    ? (() => {
        const d = new Date(status.lastUpdated);
        return (
          d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
          ", " +
          d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        );
      })()
    : "";

  const chart = useInView<HTMLDivElement>();

  const stats = status?.stats;
  const totalTrees = stats?.totalTrees ?? 1326;
  const totalAreaHa = stats?.totalAreaHa ?? 11.92;
  const totalGroves = stats?.totalGroves ?? 8;
  const documentedPhotos = stats?.documentedPhotos ?? 0;
  const bottlingRuns = stats?.bottlingRuns ?? 0;

  return (
    <>
      <div className="kog-utility">
        <span>
          <span className="live-dot" />
          Live grove status · Updated as the family team works
        </span>
        <span>Rameh · Upper Galilee · خَلَف</span>
      </div>

      <nav className="kog-nav">
        <a className="kog-nav__brand" href="#top">
          <img src={asset("ds/assets/khalaf-logo-color-transparent.png")} alt="Khalaf" />
          <div>
            <div className="b1">KHALAF</div>
            <div className="b2">Olive Groves · Since {founded}</div>
          </div>
        </a>
        <div className="kog-nav__links">
          <a href="#story" className="active">Our roots</a>
          <a href="#live">Grove status</a>
          <a href="#trace">Traceability</a>
          <a href="#trees">Witness trees</a>
        </div>
        <a href="https://khalafolives.com" target="_blank" rel="noreferrer">
          <button className="kog-nav__cta">Shop the oil</button>
        </a>
      </nav>

      <header className="kog-hero" id="top">
        <div className="kog-hero__copy">
          <div className="kog-hero__eb">
            <span>Rameh, Upper Galilee</span>
            <span className="sep" />
            <span>Since {founded}</span>
          </div>
          <h1 className="kog-hero__title">
            A Well-Rooted
            <br />
            <em>Olive Oil.</em>
          </h1>
          <p className="kog-hero__lede">
            Five generations of the Khalaf family have tended these terraced groves above
            Rameh — some trees older than the village itself. We grow them rainfed, harvest
            them late, and press them in our own mill. Every bottle, traceable to the grove
            and to the trees that gave it life.
          </p>
          <div className="kog-hero__cta">
            <a href="https://khalafolives.com" target="_blank" rel="noreferrer">
              <button className="kog-btn">Shop the oil →</button>
            </a>
            <a href="#live">
              <button className="kog-btn kog-btn--ghost">See live grove data</button>
            </a>
          </div>
        </div>
        <div
          className="kog-hero__photo"
          aria-label="Khalaf Family Estate olive oil bottle"
          style={{ backgroundImage: `url(${asset("ds/assets/bottle-hero.jpeg")})` }}
        >
          <div className="kog-hero__seal" aria-hidden="true">
            <div className="sq">
              <div className="y">{founded}</div>
              <div className="l">Since</div>
              <div className="v">Souri</div>
            </div>
          </div>
        </div>

        <div className="kog-hero__stats">
          <div className="kog-hero__stat">
            <div className="n">{yearsTradition}</div>
            <div className="l">Years of tradition</div>
            <div className="h">a family practice older than most countries on the map</div>
          </div>
          <div className="kog-hero__stat">
            <div className="n">{status?.heritage.generations ?? 5}</div>
            <div className="l">Generations</div>
            <div className="h">two sisters now stewarding the trees</div>
          </div>
          <div className="kog-hero__stat">
            <div className="n">{totalTrees.toLocaleString()}</div>
            <div className="l">Living trees</div>
            <div className="h">across {totalGroves} named family terraces</div>
          </div>
          <div className="kog-hero__stat">
            <div className="n">
              {totalAreaHa.toFixed(2)}
              <span className="ha">HA</span>
            </div>
            <div className="l">Cultivated land</div>
            <div className="h">terraces above the village of Rameh</div>
          </div>
        </div>
      </header>

      <div className="kog-tatreez" />

      {/* Roots */}
      <section className="kog-sec kog-sec--bone" id="story">
        <div className="kog-sec__lead">
          <div>
            <div className="kog-eb">Our Roots</div>
            <h2 className="kog-h2">A family practice older than most countries on the map.</h2>
          </div>
          <div className="kog-sec__body">
            <p>
              In {founded}, Khalaf Khalaf began pressing oil from the Souri olive trees on
              the terraces of Rameh — a Galilean village known for stone walls, spring
              water, and patient agriculture. The trees he tended were already centuries
              old.
            </p>
            <p>
              Today, two sisters have returned from careers in technology to continue the
              tradition — bringing the same hands-on stewardship their family has practiced
              for five generations, joined now by satellite monitoring, per-tree records,
              and a traceable bottling process.
            </p>
            <p>
              Nothing leaves the press unrecorded. Every bottle ties back to the grove, the
              harvest, and the trees that produced it.
            </p>
          </div>
        </div>

        <div className="kog-specs">
          <div>
            <div className="l">Founded</div>
            <div className="v italic">{founded}</div>
          </div>
          <div>
            <div className="l">Origin</div>
            <div className="v">{status?.heritage.origin ?? "Rameh, Galilee"}</div>
          </div>
          <div>
            <div className="l">Cultivar</div>
            <div className="v">{status?.heritage.cultivar ?? "Souri"}</div>
          </div>
          <div>
            <div className="l">Generations</div>
            <div className="v italic">{status?.heritage.generations ?? 5} and counting</div>
          </div>
        </div>
      </section>

      {/* Live status */}
      <section className="kog-sec kog-live" id="live">
        <div className="kog-sec__lead">
          <div>
            <div className="kog-live__tag">
              <span className="dot" />
              Live from the field
            </div>
            <h2 className="kog-h2">The grove, in numbers updated as we work.</h2>
          </div>
          <div className="kog-sec__body">
            <p>
              These figures come straight from our internal grove platform. As our field
              team logs trees, photos and harvests, this page keeps pace — so anyone can see
              what's happening on the terraces in something close to real time.
            </p>
            <p style={{ marginTop: 18 }}>
              <a href="#trace" className="kog-link">
                How traceability works →
              </a>
            </p>
          </div>
        </div>

        <div className="kog-kpi">
          <div className="kog-kpi__cell">
            <div className="l">Trees stewarded</div>
            <div className="n">{totalTrees.toLocaleString()}</div>
            <div className="h">Across all family terraces</div>
            <div className="kog-kpi__bar" />
          </div>
          <div className="kog-kpi__cell">
            <div className="l">Hectares cultivated</div>
            <div className="n">
              {totalAreaHa.toFixed(2)}
              <span className="u">ha</span>
            </div>
            <div className="h">In {totalGroves} named groves</div>
            <div className="kog-kpi__bar" />
          </div>
          <div className="kog-kpi__cell">
            <div className="l">Photographic records</div>
            <div className="n">{documentedPhotos.toLocaleString()}</div>
            <div className="h">Field photos captured per tree</div>
            <div className="kog-kpi__bar" />
          </div>
          <div className="kog-kpi__cell">
            <div className="l">Bottling runs</div>
            <div className="n">{bottlingRuns}</div>
            <div className="h">Each fully traceable to source</div>
            <div className="kog-kpi__bar" />
          </div>
        </div>

        <div className="kog-chart">
          <div className="kog-chart__head">
            <div>
              <h3>Trees per grove</h3>
              <div className="sub">{totalGroves} named family terraces above Rameh</div>
            </div>
            {fmtUpdated && <div className="kog-chart__updated">Updated {fmtUpdated}</div>}
          </div>
          <div className="kog-chart__body" ref={chart.ref}>
            {sortedGroves.map((g, i) => {
              const pct = (g.treeCount / maxTrees) * 100;
              return (
                <div className="kog-bar" key={g.id}>
                  <div className="kog-bar__name">
                    {g.name}
                    <span className="code">{g.code}</span>
                  </div>
                  <div className="kog-bar__track">
                    <div
                      className="kog-bar__fill"
                      style={{
                        transform: `scaleX(${chart.seen ? pct / 100 : 0})`,
                        transitionDelay: `${i * 80}ms`,
                      }}
                    />
                  </div>
                  <div className="kog-bar__meta">
                    <span className="c">{g.treeCount}</span>
                    {g.areaHa != null ? `${g.areaHa.toFixed(2)} ha` : ""}
                  </div>
                </div>
              );
            })}
            {sortedGroves.length === 0 && (
              <div style={{ padding: "20px 0", color: "var(--ink-mute)", fontStyle: "italic" }}>
                Loading grove distribution…
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Traceability — Bottle Trace dossier */}
      <TraceabilitySection />

      {/* Witness trees */}
      <section className="kog-sec kog-sec--bone" id="trees">
        <div className="kog-sec__lead">
          <div>
            <div className="kog-eb">Witnesses of the terrace</div>
            <h2 className="kog-h2">Notable trees on the family terraces.</h2>
          </div>
          <div className="kog-sec__body">
            <p>
              Each of these Souri olive trees has been documented and measured. Crown
              diameter is a proxy for age — the wider the canopy, the more decades,
              sometimes centuries, the tree has been holding its place.
            </p>
            <p
              style={{
                marginTop: 18,
                fontStyle: "italic",
                color: "var(--ink-mute)",
                fontSize: 16,
              }}
            >
              An olive tree outlives us all. In comparison with ourselves, the tree is
              eternal — we are just passers-by.
            </p>
          </div>
        </div>

        <div className="kog-trees">
          {featuredSorted.map((t) => {
            const ratio = (t.crownDiameterM ?? 0) / maxCrown;
            const crownPx = 50 + ratio * 50;
            return (
              <Link key={t.id} href={`/tree/${t.id}`}>
                <a
                  className="kog-tree"
                  style={{ display: "block", textDecoration: "none", color: "inherit", cursor: "pointer" }}
                  data-testid={`link-featured-tree-${t.id}`}
                >
                  <div className="kog-tree__crown">
                    <TreeCrownSVG crownPx={crownPx} />
                  </div>
                  <div className="kog-tree__body">
                    <div className="kog-tree__code">{t.treeCode}</div>
                    <div className="kog-tree__name">{t.groveName ?? "Khalaf grove"}</div>
                    <div className="kog-tree__variety">Souri · single tree</div>
                    <div className="kog-tree__row">
                      <div>
                        <div className="k">Crown Ø</div>
                        <div className="v">
                          {t.crownDiameterM != null ? `${t.crownDiameterM.toFixed(1)} m` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="k">Health idx</div>
                        <div className="v">
                          {t.currentHealthIndex != null ? Math.round(t.currentHealthIndex) : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                </a>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Quote */}
      <section className="kog-sec kog-sec--olive">
        <blockquote className="kog-quote">
          "The olive tree is neither a raw material nor a product. It is a senior partner."
          <span className="kog-quote__cite">— Family note, Rameh</span>
        </blockquote>
      </section>

      {/* Footer */}
      <footer className="kog-foot">
        <div className="kog-foot__top">
          <div>
            <div className="kog-foot__brand">
              <img src={asset("ds/assets/khalaf-logo-color-transparent.png")} alt="Khalaf" />
              <div className="b1">KHALAF</div>
            </div>
            <div className="kog-foot__sig">
              Premium extra virgin olive oil from the ancient Souri trees of Rameh, Upper
              Galilee. Family-owned since {founded}.
            </div>
          </div>
          <div className="kog-foot__col">
            <h5>Visit</h5>
            <a href="https://khalafolives.com" target="_blank" rel="noreferrer">
              khalafolives.com
            </a>
            <a href="https://khalafolives.com" target="_blank" rel="noreferrer">
              Shop the oil
            </a>
            <a href="#trace">Traceability</a>
          </div>
          <div className="kog-foot__col">
            <h5>Place</h5>
            <span>Rameh, Upper Galilee</span>
            <span>Five generations on the same terraces</span>
          </div>
          <div className="kog-foot__col">
            <h5>Contact</h5>
            <a href="mailto:hello@khalafolives.com">hello@khalafolives.com</a>
            <a href="#">Wholesale</a>
            <a href="#">Press</a>
          </div>
        </div>
        <div className="kog-foot__rule">
          <span>
            © {new Date().getFullYear()} Khalaf Olive Groves · Living grove figures
            aggregated from our internal traceability platform.
          </span>
          <span>خَلَف · Rameh · Galilee</span>
        </div>
      </footer>
    </>
  );
}
