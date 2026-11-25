import React, { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type CategoryId = "all" | "food" | "beauty" | "health" | "home" | "shops" | "services";
type Place = {
  id: string; name: string; category: string; categoryId: Exclude<CategoryId, "all">; address: string;
  distance: string; rating: null; phone: string; website: string; lat: number; lon: number; osmUrl: string;
};
type Coords = { latitude: number; longitude: number };
const categories: { id: CategoryId; label: string; icon: string }[] = [
  { id: "all", label: "Todos", icon: "✦" }, { id: "food", label: "Comida", icon: "♨" },
  { id: "beauty", label: "Beleza", icon: "✧" }, { id: "health", label: "Saúde", icon: "✚" },
  { id: "home", label: "Casa", icon: "⌂" }, { id: "shops", label: "Lojas", icon: "▢" },
  { id: "services", label: "Serviços", icon: "⚒" },
];
const iconFor: Record<string, string> = { food: "☕", beauty: "✧", health: "✚", home: "⌂", shops: "▢", services: "⚒" };
const cacheKey = (coords: Coords, category: CategoryId, query: string) => `bairroon:osm:${coords.latitude.toFixed(3)}:${coords.longitude.toFixed(3)}:${category}:${query.trim().toLocaleLowerCase("pt-BR")}`;

function App() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [category, setCategory] = useState<CategoryId>("all");
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"inicio" | "explorar" | "salvos" | "sobre">("inicio");
  const [saved, setSaved] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("bairroon-favorites") || "[]") as string[]; } catch { return []; }
  });
  const [detail, setDetail] = useState<Place | null>(null);
  const [locationLabel, setLocationLabel] = useState("Sua localização ainda não foi ativada");

  useEffect(() => { localStorage.setItem("bairroon-favorites", JSON.stringify(saved)); }, [saved]);

  async function search(nextCategory = category, nextQuery = query, currentCoords = coords) {
    if (!currentCoords) return;
    setLoading(true); setError("");
    const key = cacheKey(currentCoords, nextCategory, nextQuery);
    try {
      let result: Place[] | null = null;
      try {
        const cached = sessionStorage.getItem(key);
        if (cached) {
          const entry = JSON.parse(cached) as { savedAt: number; places: Place[] };
          if (Date.now() - entry.savedAt < 10 * 60 * 1000) result = entry.places;
        }
      } catch { /* armazenamento temporário indisponível: consulta sem cache */ }
      if (!result) {
        const response = await fetch("/api/nearby", {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ latitude: currentCoords.latitude, longitude: currentCoords.longitude, category: nextCategory, query: nextQuery }),
        });
        const payload = await response.json() as { places?: Place[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Não foi possível carregar os lugares.");
        result = payload.places || [];
        sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), places: result }));
      }
      const needle = nextQuery.trim().toLocaleLowerCase("pt-BR");
      setPlaces(needle ? result.filter((place) => `${place.name} ${place.category} ${place.address}`.toLocaleLowerCase("pt-BR").includes(needle)) : result);
    } catch (e) {
      setPlaces([]);
      setError(e instanceof Error ? e.message : "Falha ao buscar no mapa. Tente novamente.");
    } finally { setLoading(false); }
  }

  function requestLocation() {
    setError("");
    if (!navigator.geolocation) { setError("Este navegador não oferece localização. Use um navegador atualizado com HTTPS."); return; }
    setLocationLabel("Buscando sua localização…");
    navigator.geolocation.getCurrentPosition((position) => {
      const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setCoords(next); setLocationLabel("Busca perto de você"); setView("explorar");
      void search(category, query, next);
    }, (geoError) => {
      setLocationLabel("Localização não ativada");
      setError(geoError.code === geoError.PERMISSION_DENIED
        ? "Permita o acesso à localização no navegador e tente novamente."
        : "Não foi possível obter sua localização. Verifique as permissões e tente de novo.");
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  }

  function chooseCategory(id: CategoryId) { setCategory(id); if (coords) void search(id, query, coords); }
  function submit(event: FormEvent) { event.preventDefault(); setQuery(input.trim()); setView("explorar"); if (coords) void search(category, input.trim(), coords); else requestLocation(); }
  function toggleSaved(id: string) { setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  const visiblePlaces = view === "salvos" ? places.filter((place) => saved.includes(place.id)) : places;
  const homePlaces = useMemo(() => places.slice(0, 4), [places]);

  function PlaceCard({ place }: { place: Place }) {
    const isSaved = saved.includes(place.id);
    return <article className="place-card">
      <div className={`place-art ${place.categoryId}`}>{iconFor[place.categoryId] || "⌖"}</div>
      <div className="place-body">
        <div className="place-heading"><div><h3>{place.name}</h3><span className="place-category">{place.category}</span></div>
          <button className={`favorite ${isSaved ? "saved" : ""}`} onClick={() => toggleSaved(place.id)} aria-label={isSaved ? "Remover dos salvos" : "Salvar lugar"}>{isSaved ? "♥" : "♡"}</button>
        </div>
        <div className="place-meta"><span>⌖ {place.distance}</span><span className="dot">·</span><span>{place.address}</span></div>
        <button className="detail-link" onClick={() => setDetail(place)}>Ver detalhes <span>→</span></button>
      </div>
    </article>;
  }

  function PlaceList({ data }: { data: Place[] }) {
    if (loading) return <div className="state-box"><span className="spinner"/><b>Buscando lugares próximos…</b><p>Consultando dados abertos do OpenStreetMap.</p></div>;
    if (error) return <div className="state-box"><span className="state-icon">!</span><b>Não foi possível completar a busca</b><p>{error}</p><button className="button secondary" onClick={() => void search()}>Tentar novamente</button></div>;
    if (!coords) return <div className="state-box"><span className="state-icon">⌖</span><b>Ative sua localização</b><p>Autorizando a localização, o site procura estabelecimentos reais na sua região.</p><button className="button" onClick={requestLocation}>Usar minha localização</button></div>;
    if (!data.length) return <div className="state-box"><span className="state-icon">⌕</span><b>Nenhum lugar encontrado</b><p>Tente outra busca ou categoria. A cobertura depende do que foi mapeado na região.</p></div>;
    return <div className="places-grid">{data.map((place) => <PlaceCard key={place.id} place={place}/>)}</div>;
  }

  return <>
    <header className="topbar"><div className="shell nav">
      <a className="brand" href="#inicio" onClick={(event) => { event.preventDefault(); setView("inicio"); }} aria-label="BairroOn início">
        <span className="brand-icon"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.5c-6.4 0-11.5 5.1-11.5 11.4 0 8.2 11.5 16 11.5 16s11.5-7.8 11.5-16C27.5 7.6 22.4 2.5 16 2.5Z" fill="white"/><path d="m9.3 14.2 6.7-5.5 6.7 5.5v8.1h-4.2v-5.1h-5v5.1H9.3v-8.1Z" fill="#FF6B00"/></svg></span>
        <span>Bairro<span className="brand-accent">On</span></span>
      </a>
      <nav className="nav-links" aria-label="Navegação">
        {(["inicio", "explorar", "salvos", "sobre"] as const).map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item === "inicio" ? "Início" : item === "explorar" ? "Explorar" : item === "salvos" ? "Salvos" : "Sobre"}</button>)}
      </nav>
      <button className="button nav-action" onClick={requestLocation}>⌖ <span>Encontrar lugares</span></button>
    </div></header>

    <section className="hero"><div className="shell hero-inner">
      <div className="location-line"><span className="location-dot"/><span>BUSCA LOCAL</span><strong>{locationLabel}</strong></div>
      <h1>O melhor do bairro,<br/><span>pertinho de você.</span></h1>
      <p>Encontre comércios e serviços reais perto da sua região.</p>
      <form className="search-form" onSubmit={submit}><span className="search-icon">⌕</span><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="O que você está procurando?" aria-label="Buscar estabelecimentos"/><button aria-label="Buscar">→</button></form>
      <div className="privacy-note">Sua localização só é usada para buscar lugares próximos. <span>Saiba mais</span></div>
    </div></section>

    <main className="shell main-content">
      <button className="location-callout" onClick={requestLocation}><span className="callout-pin">⌖</span><span><b>Buscar lugares perto de você</b><small>Precisamos da sua autorização para encontrar opções na sua região.</small></span><span className="callout-arrow">→</span></button>
      {view === "inicio" && <>
        <div className="section-head"><div><h2>Explore por categoria</h2><p>Descubra quem movimenta o comércio local.</p></div><button className="text-link" onClick={() => setView("explorar")}>Ver todas →</button></div>
        <div className="category-list">{categories.map((item) => <button key={item.id} className={`category-chip ${category === item.id ? "selected" : ""}`} onClick={() => chooseCategory(item.id)}><span>{item.icon}</span>{item.label}</button>)}</div>
        <section className="promo"><div><span className="eyebrow">FEITO AQUI, PERTO DE VOCÊ</span><h2>Seu próximo favorito está no bairro.</h2><p>Comércios e serviços locais para facilitar seu dia.</p></div><div className="promo-mark">⌖</div></section>
        <div className="section-head"><div><h2>Estabelecimentos próximos</h2><p>{coords ? `${places.length} opção(ões) encontradas perto de você.` : "Ative a localização para começar a explorar."}</p></div><button className="text-link" onClick={() => setView("explorar")}>Explorar →</button></div>
        <PlaceList data={homePlaces}/>
      </>}
      {view === "explorar" && <>
        <div className="section-head"><div><span className="eyebrow">BAIRROON · DESCOBERTA LOCAL</span><h2>Explore o bairro</h2><p>Busque opções próximas usando sua localização.</p></div></div>
        <form className="search-form light" onSubmit={submit}><span className="search-icon">⌕</span><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Busque lugar, serviço ou loja" aria-label="Buscar lugares"/><button aria-label="Buscar">→</button></form>
        <div className="category-list explore-categories">{categories.map((item) => <button key={item.id} className={`category-chip ${category === item.id ? "selected" : ""}`} onClick={() => chooseCategory(item.id)}><span>{item.icon}</span>{item.label}</button>)}</div>
        <PlaceList data={visiblePlaces}/>
      </>}
      {view === "salvos" && <><div className="section-head"><div><span className="eyebrow">SUAS DESCOBERTAS</span><h2>Lugares salvos</h2><p>Seus favoritos ficam guardados neste navegador.</p></div></div><PlaceList data={visiblePlaces}/></>}
      {view === "sobre" && <><div className="section-head"><div><span className="eyebrow">BAIRROON</span><h2>Sobre o BairroOn</h2><p>Fortalecendo o comércio local.</p></div></div><section className="promo about-promo"><div><span className="eyebrow">PERTO DE VOCÊ, DE VERDADE</span><h2>Uma vitrine para o que existe no seu bairro.</h2><p>Encontre lojas, serviços e lugares próximos com dados abertos.</p></div><div className="promo-mark">⌖</div></section><div className="info-panel"><h3>Privacidade e dados</h3><p>O navegador só compartilha sua localização depois da sua autorização. O BairroOn usa as coordenadas somente para a consulta e não as salva. Os dados de estabelecimentos vêm do OpenStreetMap e podem estar incompletos dependendo do mapeamento local.</p><p className="osm-credit">Dados © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">contribuidores do OpenStreetMap</a> · Licença ODbL.</p></div></>}
      <footer className="footer">BairroOn · Dados © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">contribuidores do OpenStreetMap</a> · Dados abertos sob licença ODbL.</footer>
    </main>

    {detail && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><span className="eyebrow">OPENSTREETMAP</span><h2 id="modal-title">{detail.name}</h2></div><button className="modal-close" onClick={() => setDetail(null)} aria-label="Fechar">×</button></div><div className="modal-info"><p><b>Categoria</b>{detail.category}</p><p><b>Endereço</b>{detail.address}</p><p><b>Distância</b>{detail.distance}</p>{detail.phone && <p><b>Telefone</b><a href={`tel:${detail.phone}`}>{detail.phone}</a></p>}{detail.website && <p><b>Site</b><a href={detail.website} target="_blank" rel="noreferrer">Abrir site ↗</a></p>}</div><div className="modal-actions"><button className="button secondary" onClick={() => toggleSaved(detail.id)}>{saved.includes(detail.id) ? "♥ Salvo" : "♡ Salvar lugar"}</button><a className="button" href={detail.osmUrl} target="_blank" rel="noreferrer">Ver no OpenStreetMap ↗</a></div><p className="modal-credit">Dados © contribuidores do OpenStreetMap · Licença ODbL.</p></section></div>}
  </>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
