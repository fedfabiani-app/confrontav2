import type { Request } from "express";
import prisma from "../services/database";
import { resolveEnglishSign } from "@shared/constants";
import { getItalyToday } from "../config/scraperConfig";

// SSR "leggera" dei meta tag (title/description/og:*/twitter:*) per la
// pagina /sign/:sign. Il resto della pagina resta CSR: React monta e fa
// fetch come sempre. Questo modulo tocca SOLO l'HTML del template prima
// che venga inviato, per dare a WhatsApp/Telegram/Facebook — che non
// eseguono JS — un'anteprima corretta per link come
// /sign/aries?fonte=<sourceId>&date=YYYY-MM-DD (v. handleShare in
// client/src/pages/SignDetail.tsx).
//
// Nota performance: gira su OGNI visita reale di /sign/:sign (umana o
// bot), non solo sui crawler — 1 query sempre (zodiacSign.findFirst su
// name_english, @unique), +1 solo se ?fonte= è presente e non ?vista=
// weekly (horoscopeData.findFirst sull'indice unico composito
// [source_id, zodiac_sign_id, date]). Entrambe point-lookup indicizzati.
// Se in futuro servisse assorbire burst di aperture dello stesso link
// condiviso, un cache TTL breve (30-60s) keyed su
// `${englishSign}:${fonteId ?? ''}:${dateStr}` sarebbe l'ottimizzazione
// naturale — non implementata qui, non necessaria per ora.

const SIGN_PATH_RE = /^\/sign\/([^/]+)\/?$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setMetaContent(html: string, attr: "name" | "property", key: string, value: string): string {
  const re = new RegExp(`(<meta[^>]*\\b${attr}="${key}"[^>]*\\bcontent=")[^"]*("[^>]*>)`, "i");
  return html.replace(re, `$1${value}$2`);
}

function setTitle(html: string, value: string): string {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${value}</title>`);
}

// NOTE: both call sites mount this via `app.use("*", ...)`. Express treats
// "*" as a mount path and rewrites req.url/req.path relative to it, so
// req.path is always "/" here regardless of the real request — only
// req.originalUrl still holds the true path. Must use this everywhere
// instead of req.path.
function getPathname(req: Request): string {
  return req.originalUrl.split("?")[0];
}

interface MetaValues {
  title: string;
  description: string;
  ogUrl: string | null;
}

async function resolveMeta(req: Request): Promise<MetaValues | null> {
  const match = getPathname(req).match(SIGN_PATH_RE);
  if (!match) return null;

  const englishSign = resolveEnglishSign(match[1]);
  if (!englishSign) return null;

  const zodiacSign = await prisma.zodiacSign.findFirst({
    where: { name_english: englishSign },
    select: { id: true, name_italian: true },
  });
  if (!zodiacSign) return null;

  const rawDate = req.query.date;
  const dateStr = typeof rawDate === "string" && DATE_RE.test(rawDate) ? rawDate : getItalyToday();
  const isWeekly = req.query.vista === "weekly";

  const rawFonte = req.query.fonte;
  const fonteId = typeof rawFonte === "string" ? parseInt(rawFonte, 10) : NaN;
  const hasFonte = Number.isInteger(fonteId) && fonteId > 0 && !isWeekly;

  let title: string;
  let description: string;

  if (hasFonte) {
    const horoscope = await prisma.horoscopeData.findFirst({
      where: { source_id: fonteId, zodiac_sign_id: zodiacSign.id, date: new Date(dateStr) },
      select: { superquote: true, source: { select: { name: true } } },
    });

    if (horoscope?.superquote) {
      const signItalian = escapeHtml(zodiacSign.name_italian);
      const sourceName = escapeHtml(horoscope.source.name);
      const superquote = escapeHtml(horoscope.superquote);
      title = `Oroscopo ${signItalian} secondo ${sourceName} – Confronta Oroscopo`;
      // Virgolette tipografiche “ ” (non l'apice dritto "), coerenti con
      // client/src/pages/SignDetail.tsx — e soprattutto non collidono col
      // carattere che delimita l'attributo content="..." qui sotto.
      description = `“${superquote}” — L'oroscopo di ${sourceName} per ${signItalian}. Confrontalo con le altre fonti su Confronta Oroscopo.`;
      return { title, description, ogUrl: buildOgUrl(req) };
    }
    // Nessun dato per questa fonte/data: fallback ai tag generici del segno.
  }

  const signItalian = escapeHtml(zodiacSign.name_italian);
  title = `Oroscopo ${signItalian} di oggi – Confronta Oroscopo`;
  description = `Scopri e confronta le previsioni di oggi per ${signItalian} da tutte le fonti astrologiche italiane su Confronta Oroscopo.`;
  return { title, description, ogUrl: buildOgUrl(req) };
}

function buildOgUrl(req: Request): string | null {
  const base = (process.env.BASE_URL_FRONTEND || "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}${req.originalUrl}`;
}

export async function injectSignMetaTags(html: string, req: Request): Promise<string> {
  if (!SIGN_PATH_RE.test(getPathname(req))) return html;

  try {
    const meta = await resolveMeta(req);
    if (!meta) return html;

    let result = html;
    result = setTitle(result, meta.title);
    result = setMetaContent(result, "name", "description", meta.description);
    result = setMetaContent(result, "property", "og:title", meta.title);
    result = setMetaContent(result, "property", "og:description", meta.description);
    result = setMetaContent(result, "name", "twitter:title", meta.title);
    result = setMetaContent(result, "name", "twitter:description", meta.description);
    if (meta.ogUrl) {
      result = setMetaContent(result, "property", "og:url", meta.ogUrl);
    }
    return result;
  } catch (error) {
    console.error("[seo/signMeta] injection failed, serving default tags:", error);
    return html;
  }
}
