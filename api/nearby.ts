import type { VercelRequest, VercelResponse } from "@vercel/node";

type Category = "all" | "food" | "beauty" | "health" | "home" | "shops" | "services";
type OSMElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const ALLOWED_CATEGORIES = new Set<Category>(["all", "food", "beauty", "health", "home", "shops", "services"]);
const CATEGORY_SELECTOR: Record<Category, string[]> = {
  all: ["[shop]", "[amenity]", "[office]", "[craft]"],
  food: ['[amenity~"^(restaurant|cafe|fast_food|bar|food_court|ice_cream|pub)$"]'],
  beauty: ['[shop~"^(beauty|hairdresser|cosmetics|massage)$"]'],
  health: ['[amenity~"^(doctors|dentist|pharmacy|clinic|hospital|veterinary)$"]'],
  home: ['[shop~"^(hardware|doityourself|furniture|houseware|garden_centre|trade)$"]'],
  shops: ["[shop]"],
  services: ["[office]", "[craft]", '[amenity~"^(post_office|bank|fuel|car_wash|car_repair|laundry)$"]'],
};

function jsonError(res: VercelResponse, status: number, message: string) {
  return res.status(status).json({ error: message });
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function categoryFor(tags: Record<string, string>): Exclude<Category, "all"> {
  if (tags.amenity && /restaurant|cafe|fast_food|bar|food_court|ice_cream|pub/.test(tags.amenity)) return "food";
  if (tags.shop && /beauty|hairdresser|cosmetics|massage/.test(tags.shop)) return "beauty";
  if (tags.amenity && /doctors|dentist|pharmacy|clinic|hospital|veterinary/.test(tags.amenity)) return "health";
  if (tags.shop && /hardware|doityourself|furniture|houseware|garden_centre|trade/.test(tags.shop)) return "home";
  if (tags.shop) return "shops";
  return "services";
}

function labelFor(tags: Record<string, string>) {
  const value = tags.shop || tags.amenity || tags.office || tags.craft || tags.leisure || tags.tourism || "Estabelecimento";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function addressFor(tags: Record<string, string>) {
  const street = tags["addr:street"];
  const number = tags["addr:housenumber"];
  const neighbourhood = tags["addr:suburb"] || tags["addr:neighbourhood"];
  return [street ? [street, number].filter(Boolean).join(", ") : null, neighbourhood, tags["addr:city"]]
    .filter(Boolean).join(" · ") || "Endereço não informado no mapa";
}

function makeQuery(lat: number, lon: number, category: Category) {
  const selectors = CATEGORY_SELECTOR[category].map((tag) => `nwr(around:3000,${lat},${lon})[name]${tag};`).join("");
  return `[out:json][timeout:12][maxsize:67108864];(${selectors});out center 100;`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return jsonError(res, 405, "Use POST para buscar estabelecimentos.");
  }

  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const category = String(body.category || "all") as Category;
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 80).toLocaleLowerCase("pt-BR") : "";

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return jsonError(res, 400, "Coordenadas inválidas. Autorize a localização e tente novamente.");
  }
  if (!ALLOWED_CATEGORIES.has(category)) return jsonError(res, 400, "Categoria inválida.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstream = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
        "User-Agent": "BairroOn/1.0 (+https://bairroon-flax.vercel.app)",
      },
      body: `data=${encodeURIComponent(makeQuery(latitude, longitude, category))}`,
      signal: controller.signal,
    });
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 503 : 502;
      return jsonError(res, status, upstream.status === 429
        ? "O mapa está recebendo muitas consultas. Aguarde um pouco e tente novamente."
        : "O serviço de dados abertos está temporariamente indisponível.");
    }
    const payload = await upstream.json() as { elements?: OSMElement[] };
    const seen = new Set<string>();
    const places = (payload.elements || []).flatMap((element) => {
      const tags = element.tags || {};
      const point = element.center || (element.lat !== undefined && element.lon !== undefined ? { lat: element.lat, lon: element.lon } : null);
      if (!point) return [];
      const name = tags.name || tags["name:pt"];
      if (!name) return [];
      const normalizedCategory = categoryFor(tags);
      if (category !== "all" && normalizedCategory !== category) return [];
      if (query && !`${name} ${labelFor(tags)} ${addressFor(tags)}`.toLocaleLowerCase("pt-BR").includes(query)) return [];
      const distance = distanceKm(latitude, longitude, point.lat, point.lon);
      const duplicateKey = `${name.toLocaleLowerCase("pt-BR")}:${point.lat.toFixed(4)}:${point.lon.toFixed(4)}`;
      if (seen.has(duplicateKey)) return [];
      seen.add(duplicateKey);
      return [{
        id: `${element.type}/${element.id}`,
        name,
        category: labelFor(tags),
        categoryId: normalizedCategory,
        address: addressFor(tags),
        distanceKm: Math.round(distance * 100) / 100,
        distance: distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`,
        rating: null,
        phone: tags.phone || tags["contact:phone"] || "",
        website: tags.website || tags["contact:website"] || "",
        lat: point.lat,
        lon: point.lon,
        osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      }];
    }).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 60);
    return res.status(200).json({ places, source: "OpenStreetMap", attribution: "© contribuidores do OpenStreetMap" });
  } catch (error) {
    console.error("nearby lookup failed", error instanceof Error ? error.name : "unknown_error");
    return jsonError(res, 502, error instanceof Error && error.name === "AbortError"
      ? "A busca demorou demais. Tente novamente em instantes."
      : "Não foi possível buscar os lugares agora. Tente novamente.");
  } finally {
    clearTimeout(timeout);
  }
}
