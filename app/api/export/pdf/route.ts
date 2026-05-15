import { NextResponse } from "next/server";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { createElement } from "react";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface ExportItem {
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
  h: { flexDirection: "row", borderBottom: "2px solid #c8d3df", paddingVertical: 3 },
  cName: { width: "30%" },
  cIfs: { width: "16%" },
  cPri: { width: "12%" },
  cSta: { width: "12%" },
  cLast: { width: "15%" },
  cNext: { width: "15%" },
  hc: { fontWeight: 700, color: "#445566" },
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = (await request.json()) as Payload;

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
        return createElement(
          View,
          { key: zid, wrap: false },
          createElement(Text, { style: s.zone }, `${zid} — ${zname}`),
          createElement(
            View,
            { style: s.h },
            createElement(Text, { style: [s.cName, s.hc] }, "Item"),
            createElement(Text, { style: [s.cIfs, s.hc] }, "IFS"),
            createElement(Text, { style: [s.cPri, s.hc] }, "Priority"),
            createElement(Text, { style: [s.cSta, s.hc] }, "Status"),
            createElement(Text, { style: [s.cLast, s.hc] }, "Last"),
            createElement(Text, { style: [s.cNext, s.hc] }, "Next")
          ),
          ...zoneItems.map((it, idx) =>
            createElement(
              View,
              { key: idx, style: s.row },
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
          )
        );
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
