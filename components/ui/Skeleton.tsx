import { S } from "@/lib/design/styles";
import { DS } from "@/lib/design/tokens";

function Bar({ w, h = 14 }: { w: string | number; h?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 5,
        background:
          "linear-gradient(90deg," +
          DS.sur2 +
          " 0%, " +
          DS.bord +
          " 50%, " +
          DS.sur2 +
          " 100%)",
        backgroundSize: "200% 100%",
        animation: "skeleton 1.3s ease-in-out infinite",
      }}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{ ...S.card, display: "flex", gap: 12, alignItems: "center" }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: DS.sur2,
                flexShrink: 0,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Bar w={70} h={9} />
              <Bar w={50} h={18} />
              <Bar w={80} h={8} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ ...S.card, marginBottom: 16 }}>
        <Bar w={180} h={11} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginTop: 14,
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <Bar key={i} w="100%" h={16} />
          ))}
        </div>
      </div>
    </div>
  );
}
