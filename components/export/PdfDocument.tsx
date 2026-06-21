"use client";

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";

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

export interface PdfItem {
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

export interface PdfPhoto {
  evidence_date: string;
  // base64 data URL ("data:image/jpeg;base64,..."). @react-pdf reliably
  // renders data URLs in the browser; a raw Blob src is not honoured.
  data: string;
}

export interface PdfDocProps {
  generated: string;
  total: number;
  sece: number;
  critical: number;
  items: PdfItem[];
  photosByItem?: Map<string, PdfPhoto[]>;
}

export function PdfDocument({
  generated,
  total,
  sece,
  critical,
  items,
  photosByItem,
}: PdfDocProps) {
  const zones = Array.from(new Set(items.map((i) => i.zid))).sort();

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Corrosion Management Plan</Text>
        <Text style={s.sub}>
          SS-75 Noble Courage · Generated {generated}
        </Text>
        <Text style={s.sub}>
          Total {total} · SECE {sece} · Critical {critical} · NORSOK M-001 /
          DNV-RP-G101 / ISO 21457 / NACE MR0175
        </Text>
        {zones.map((zid) => {
          const zoneItems = items.filter((i) => i.zid === zid);
          const zname = zoneItems[0]?.zname ?? "";
          const rows: ReactNode[] = [];
          zoneItems.forEach((it, idx) => {
            rows.push(
              <View key={`r${idx}`} style={s.row}>
                <Text style={s.cName}>
                  {(it.sece ? "[SECE] " : "") + it.name}
                </Text>
                <Text style={s.cIfs}>{it.ifs || "-"}</Text>
                <Text style={s.cPri}>{it.priority || "-"}</Text>
                <Text style={s.cSta}>{it.status || "-"}</Text>
                <Text style={s.cLast}>{it.last_insp || "-"}</Text>
                <Text style={s.cNext}>{it.next_insp || "-"}</Text>
              </View>
            );
            const photos = photosByItem?.get(it.id);
            if (photos && photos.length) {
              rows.push(
                <View key={`p${idx}`} style={s.photoStrip} wrap={false}>
                  {photos.map((p, pi) => (
                    <View key={pi} style={s.photoCell}>
                      {/* eslint-disable-next-line jsx-a11y/alt-text */}
                      <Image style={s.photoImg} src={p.data} />
                      <Text style={s.photoCaption}>{p.evidence_date}</Text>
                    </View>
                  ))}
                </View>
              );
            }
          });
          return (
            <View key={zid} wrap={false}>
              <Text style={s.zone}>
                {zid} — {zname}
              </Text>
              <View style={s.h}>
                <Text style={[s.cName, s.hc]}>Item</Text>
                <Text style={[s.cIfs, s.hc]}>IFS</Text>
                <Text style={[s.cPri, s.hc]}>Priority</Text>
                <Text style={[s.cSta, s.hc]}>Status</Text>
                <Text style={[s.cLast, s.hc]}>Last</Text>
                <Text style={[s.cNext, s.hc]}>Next</Text>
              </View>
              {rows}
            </View>
          );
        })}
      </Page>
    </Document>
  );
}
