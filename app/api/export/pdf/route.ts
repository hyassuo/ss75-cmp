import { NextResponse } from "next/server";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { createElement, type ReactNode } from "react";
import { requireUser, sameOrigin } from "@/lib/supabase/adminGuard";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/utils/rateLimit";

const MAX_EXPORT_ITEMS = 5000;
// Cap per item to keep PDF size sane (~250KB per jpeg => 1MB max per item).
const MAX_PHOTOS_PER_ITEM = 4;
// Hard ceiling on how many items can carry photos in one PDF. Without this
// a 5000-item export with photos would trigger 20 000 storage fetches and
// blow past the serverless function's 10s budget. Items beyond the cap
// still appear in the PDF — they just render without thumbnails.
const MAX_ITEMS_WITH_PHOTOS = 50;
const PHOTO_SIGNED_URL_TTL = 60 * 10; // 10 min
// PDF generation is expensive (especially with photos).
const RATE_LIMIT = 6;
const RATE_WINDOW_MS = 60_000;

export const runtime = "nodejs";

interface ExportItem {
  id: string;
  zid: string;
  zname: string;
  name: string;
  ifs: string;
  priority: string;
  status: string;
  sece: boolean;
  last_insp: string;
  next_insp: string;
  rate: string;
}

interface Payload {
  generated: string;
  total: number;
  sece: number;
  critical: number;
  items: ExportItem[];
  includePhotos?: boolean;
}

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: "#1e2d3d" },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  sub: { fontSize: 9, color: "#445566", marginBottom: 2 },
  zone: {
    fontSize: 11,
    fontWeight: 700,
    marginTop: 14,
    marginBottom: 4,
    color: "#1a5cb5",
  },
  row: {
    flexDirection: "row",
    borderBottom: "1px solid #dde4ed",
    paddingVertical: 3,
  },
  h: {
    flexDirection: "row",
    borderBottom: "2px solid #c8d3df",
    paddingVertical: 3,
  },
  cName: { width: "30%" },
  cIfs: { width: "16%" },
  cPri: { width: "12%" },
  cSta: { width: "12%" },
  cLast: { width: "15%" },
  cNext: { width: "15%" },
  hc: { fontWeight: 700, color: "#445566" },
  photoStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
    marginBottom: 6,
    marginLeft: 4,
  },
  photoCell: { width: 90, marginRight: 4, marginBottom: 4 },
  photoImg: {
    width: 90,
    height: 64,
    objectFit: "cover",
    border: "1px solid #dde4ed",
  },
  photoCaption: { fontSize: 7, color: "#445566", marginTop: 1 },
});

interface PhotoRef {
  item_id: string;
  evidence_date: string;
  bytes: Buffer;
}

interface EvidenceRow {
  item_id: string;
  evidence_date: string;
  file_path: string | null;
  file_type: string | null;
}

// Fetches the most recent N image evidences per item, downloads the bytes
// via signed URLs (server-side, no client exposure). Returns a Map keyed by
// item_id. Items the user can't read via RLS are silently skipped.
async function loadPhotos(itemIds: string[]): Promise<Map<string, PhotoRef[]>> {
  const result = new Map<string, PhotoRef[]>();
  if (itemIds.length === 0) return result;

  const supabase = await createClient();
  const { data: evs } = await supabase
    .from("evidences")
    .select("item_id, evidence_date, file_path, file_type")
    .in("item_id", itemIds)
    .like("file_type", "image/%")
    .not("file_path", "is", null)
    .order("evidence_date", { ascending: false });

  if (!evs) return result;

  const byItem = new Map<string, EvidenceRow[]>();
  for (const e of evs as EvidenceRow[]) {
    const arr = byItem.get(e.item_id) ?? [];
    if (arr.length < MAX_PHOTOS_PER_ITEM) arr.push(e);
    byItem.set(e.item_id, arr);
  }

  // Sign all paths in one call and download in parallel.
  const allPaths: string[] = [];
  byItem.forEach((arr) => arr.forEach((e) => e.file_path && allPaths.push(e.file_path)));
  if (allPaths.length === 0) return result;

  const { data: signed } = await supabase.storage
    .from("evidence-photos")
    .createSignedUrls(allPaths, PHOTO_SIGNED_URL_TTL);
  const urlByPath = new Map<string, string>();
  (signed ?? []).forEach((s) => {
    if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  });

  await Promise.all(
    Array.from(byItem.entries()).map(async ([itemId, arr]) => {
      const photos: PhotoRef[] = [];
      for (const e of arr) {
        if (!e.file_path) continue;
        const url = urlByPath.get(e.file_path);
        if (!url) continue;
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const buf = Buffer.from(await r.arrayBuffer());
          photos.push({
            item_id: itemId,
            evidence_date: e.evidence_date,
            bytes: buf,
          });
        } catch {
          // Skip individual fetch failures rather than abort the whole PDF.
        }
      }
      if (photos.length) result.set(itemId, photos);
    })
  );

  return result;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const guard = await requireUser();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const rl = rateLimit(`pdf:${guard.ctx.userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const data = (await request.json()) as Payload;
  if (!Array.isArray(data.items) || data.items.length > MAX_EXPORT_ITEMS) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Cap photo loading to keep storage fetches and function time bounded.
  const idsForPhotos = data.includePhotos
    ? data.items
        .map((i) => i.id)
        .filter(Boolean)
        .slice(0, MAX_ITEMS_WITH_PHOTOS)
    : [];
  const photosByItem = idsForPhotos.length
    ? await loadPhotos(idsForPhotos)
    : new Map<string, PhotoRef[]>();

  const zones = Array.from(new Set(data.items.map((i) => i.zid))).sort();

  const doc = createElement(
    Document,
    null,
    createElement(
      Page,
      { size: "A4", style: s.page },
      createElement(Text, { style: s.title }, "Corrosion Management Plan"),
      createElement(
        Text,
        { style: s.sub },
        `SS-75 Noble Courage · Generated ${data.generated}`
      ),
      createElement(
        Text,
        { style: s.sub },
        `Total ${data.total} · SECE ${data.sece} · Critical ${data.critical} · NORSOK M-001 / DNV-RP-G101 / ISO 21457 / NACE MR0175`
      ),
      ...zones.map((zid) => {
        const zoneItems = data.items.filter((i) => i.zid === zid);
        const zname = zoneItems[0]?.zname ?? "";
        const children: ReactNode[] = [
          createElement(Text, { key: "z", style: s.zone }, `${zid} — ${zname}`),
          createElement(
            View,
            { key: "h", style: s.h },
            createElement(Text, { style: [s.cName, s.hc] }, "Item"),
            createElement(Text, { style: [s.cIfs, s.hc] }, "IFS"),
            createElement(Text, { style: [s.cPri, s.hc] }, "Priority"),
            createElement(Text, { style: [s.cSta, s.hc] }, "Status"),
            createElement(Text, { style: [s.cLast, s.hc] }, "Last"),
            createElement(Text, { style: [s.cNext, s.hc] }, "Next")
          ),
        ];

        zoneItems.forEach((it, idx) => {
          children.push(
            createElement(
              View,
              { key: `r${idx}`, style: s.row },
              createElement(
                Text,
                { style: s.cName },
                (it.sece ? "[SECE] " : "") + it.name
              ),
              createElement(Text, { style: s.cIfs }, it.ifs || "-"),
              createElement(Text, { style: s.cPri }, it.priority || "-"),
              createElement(Text, { style: s.cSta }, it.status || "-"),
              createElement(Text, { style: s.cLast }, it.last_insp || "-"),
              createElement(Text, { style: s.cNext }, it.next_insp || "-")
            )
          );
          const photos = photosByItem.get(it.id);
          if (photos && photos.length) {
            children.push(
              createElement(
                View,
                { key: `p${idx}`, style: s.photoStrip, wrap: false },
                ...photos.map((p, pi) =>
                  createElement(
                    View,
                    { key: pi, style: s.photoCell },
                    createElement(Image, { style: s.photoImg, src: p.bytes }),
                    createElement(
                      Text,
                      { style: s.photoCaption },
                      p.evidence_date
                    )
                  )
                )
              )
            );
          }
        });

        return createElement(View, { key: zid, wrap: false }, ...children);
      })
    )
  );

  const buffer = await renderToBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="ss75-cmp.pdf"',
    },
  });
}
