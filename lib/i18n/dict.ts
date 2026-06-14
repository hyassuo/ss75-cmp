// i18n dictionary. Keys are flat dotted strings (header.title, sidebar.zones).
// Portuguese translations use the terminology common in Brazilian offshore
// O&G (Petrobras / Noble / ANP standards) — not literal Google Translate.
//
// Where a term has no clean Portuguese equivalent in the industry (RPN,
// SECE, IFS, dropdown enum values stored in the DB, IBM Plex / etc.), the
// English value is kept identical in both languages so logic and exports
// stay stable.

import type { ItemPriority, ItemStatus, EffectiveStatus } from "@/lib/types/domain";

export type Lang = "en" | "pt";

// Each value is either a fixed string or a function that builds one from
// runtime args. Typed loosely so the PT dict can supply translated literals
// without TS narrowing complaints.
type Value = string | ((...args: never[]) => string);
type DictMap = Record<string, Value>;

// Flat dict. Adding a key in EN without PT (or vice versa) is fine — the
// hook falls back to EN if a PT value is missing, and to the key itself
// as a last resort.
const en = {
  // Header
  "header.title": "Corrosion Management Plan",
  "header.subtitle": "Noble Courage SS-75",
  "header.departments": "Departments:",
  "status.healthy": "HEALTHY",
  "status.attention": "ATTENTION",
  "status.degraded": "DEGRADED",

  // Departments (display labels for SystemFilter enum)
  "dept.All": "All",
  "dept.Drilling": "Drilling",
  "dept.Maintenance": "Maintenance",
  "dept.Marine": "Marine",
  "dept.Safety": "Safety",
  "dept.Third Party": "Third Party",

  // Sidebar
  "nav.dashboard": "Dashboard",
  "nav.zones": "Zones & Items",
  "nav.risk": "Risk Matrix",
  "nav.schedule": "Schedule",
  "nav.export": "Export",
  "nav.users": "Users",
  "nav.audit": "Audit Log",
  "nav.newItem": "+ New Item",
  "nav.newItemShort": "+",
  "nav.addItem": "+ Item",
  "nav.signOut": "⏻  Sign out",
  "nav.signOutShort": "⏻",
  "nav.signOutConfirm": "Sign out?",

  // Footer
  "footer.developedBy": "Developed by Helcio Yassuo",

  // Loading / generic
  "common.loading": "Loading…",
  "common.generating": "Generating…",
  "common.saving": "Saving…",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.create": "Create",
  "common.add": "+ Add",
  "common.tryAgain": "Try again",
  "common.error": "Something went wrong",
  "common.confirmDelete": "Delete this item? This cannot be undone.",

  // Dashboard
  "dash.integrityIndex": "Integrity Index",
  "dash.inspectionCompliance": "Inspection Compliance",
  "dash.scheduleCompliance": "Schedule Compliance",
  "dash.seceOk": "SECE OK",
  "dash.criticalItemsOk": "Critical Items OK",
  "dash.byZone": "Integrity Index by Zone",
  "dash.weightedNote": "weighted: priority × SECE",
  "dash.needsTwo": "needs 2+ items to calculate index",
  "dash.noItems": "No items registered",
  "dash.noItemsCta": "Go to Zones & Items to add your first inspection item.",
  "dash.inspected": "inspected",
  "dash.overdueDue30": (od: number, d30: number) =>
    `${od} overdue / ${d30} due in 30d`,
  "dash.items": "items",
  "dash.item": "item",

  // Integrity labels
  "integrity.GOOD": "GOOD",
  "integrity.FAIR": "FAIR",
  "integrity.DEGRADED": "DEGRADED",
  "integrity.CRITICAL": "CRITICAL",
  "integrity.NA": "N/A",

  // Priority (display only — DB stores the EN enum)
  "priority.Critical": "Critical",
  "priority.High": "High",
  "priority.Medium": "Medium",
  "priority.Low": "Low",

  // Status (display only)
  "statusItem.OK": "OK",
  "statusItem.Attention": "Attention",
  "statusItem.Critical": "Critical",
  "statusItem.Pending": "Pending",
  "statusItem.Overdue": "Overdue",

  // Alerts
  "alert.title": "Active Alerts",
  "alert.critical": "critical",
  "alert.warning": "warning",
  "alert.total": "total",
  "alert.overdueSince": "inspection OVERDUE since",
  "alert.dueIn": "inspection due in",
  "alert.days": "days",
  "alert.critRate": "critical corrosion rate",
  "alert.elevRate": "elevated corrosion rate",

  // Item modal — section titles
  "sec.evidence": "INSPECTION EVIDENCE",
  "sec.identification": "IDENTIFICATION",
  "sec.ifs": "IFS OBJECT",
  "sec.risk": "RISK ASSESSMENT",
  "sec.inspection": "INSPECTION & PLANNING",
  "sec.pit": "PIT DEPTH MEASUREMENTS (Manual Gauge)",
  "sec.history": "HISTORY",
  "sec.notes": "NOTES",
  "sec.evidenceHint":
    "Start by adding a photo. AI analysis will auto-populate corrosion type, severity and suggested priority.",
  "modal.editItem": "Edit Item -",
  "modal.newItem": "New Item -",
  "modal.markResolved": "Mark as Resolved",
  "modal.resolved": "Resolved",
  "modal.createItem": "Create Item",
  "modal.untitled": "Untitled",

  // Modal field labels
  "f.itemName": "Item Name / Tag",
  "f.mechanism": "Corrosion Mechanism",
  "f.protection": "Applied Protection",
  "f.objectId": "Object ID / Description (IFS)",
  "f.wo": "IFS Work Order",
  "f.fl": "IFS Functional Location",
  "f.probability": "Probability (1-5)",
  "f.consequence": "Consequence (1-5)",
  "f.priorityAuto": "Priority (auto)",
  "f.rpn": "RPN",
  "f.status": "Status",
  "f.sece": "SECE (Safety & Environmental Critical Element)",
  "f.seceFromIFS": "from IFS",
  "f.seceSelect": "select an IFS Object",
  "f.frequency": "Inspection Frequency",
  "f.lastInsp": "Last Inspection",
  "f.nextInsp": "Next Inspection (auto)",
  "f.date": "Date",
  "f.pitDepth": "Pit Depth (mm)",
  "f.location": "Location / Point",
  "f.checkedBy": "Checked by",
  "f.addReading": "+ Reading",
  "f.pitRate": "Pit Growth Rate",
  "f.photoEv": "Photo / Evidence",
  "f.findingDesc": "Finding / Description",
  "f.notes": "Notes",
  "f.notRecorded": "No readings recorded yet",
  "f.noEvidence": "No evidence recorded yet",
  "f.calculating": "Calculating...",
  "f.setPC": "Set P + C",
  "f.imageReady": "Image ready — click to run AI corrosion analysis.",
  "f.uploadFirst": "Upload an image to enable AI analysis.",
  "f.analyse": "🔍 Analyse with AI",
  "f.analysing": "Analysing...",

  // Probability descriptions (from MSC_2123.0_A)
  "prob.1": "Never occurred in the Industry",
  "prob.2": "Has occurred in the Industry",
  "prob.3": "Has occurred in the Company",
  "prob.4": "Multiple occurrences per year in the Company",
  "prob.5": "Multiple occurrences per year at the Facility",
  "cons.1": "Insignificant",
  "cons.2": "Minor",
  "cons.3": "Moderate",
  "cons.4": "Serious",
  "cons.5": "Critical",
  "risk.legend": "Legend",

  // SECE display
  "sece.yes": "YES",
  "sece.no": "NO",
  "sece.na": "—",

  // Rate hints
  "rate.critical": "CRITICAL - Immediate Action",
  "rate.severe": "Severe - Increase Monitoring",
  "rate.moderate": "Moderate - Monitor",
  "rate.stable": "Stable",

  // Risk matrix
  "risk.title": "Risk Matrix — API 580 / DNV-RP-G101",
  "risk.assessedOf": (with_: number, total: number) =>
    `${with_} of ${total} items assessed`,
  "risk.empty.title": "No items with risk assessment",
  "risk.empty.hint": "Edit items and fill in Probability and Consequence.",
  "risk.highTitle": "High / Critical Risk Items (RPN ≥ 8)",

  // Schedule
  "sched.horizon": "Horizon:",
  "sched.until": "Until",
  "sched.overdue": "Overdue",
  "sched.dueIn": "Due in next",
  "sched.days": "days",
  "sched.notScheduled": "Not scheduled",
  "sched.allClear": (h: number) =>
    `No overdue or upcoming inspections within ${h} days.`,

  // Export tab
  "exp.title": "Export",
  "exp.itemsSuffix": "items",
  "exp.format":
    "CSV (flat list) · XLSX (Items / Readings / Evidences / History) · PDF (formatted report)",
  "exp.csv": "Export CSV",
  "exp.xlsx": "Export XLSX",
  "exp.pdf": "Export PDF",
  "exp.includePhotos":
    "Include evidence photos in PDF (up to 4 per item — larger file, slower to generate)",
  "exp.summary": "Summary Table",
  "exp.pdfFail": "PDF export failed.",
} satisfies DictMap;

type Key = keyof typeof en;
type Translations = Partial<Record<Key, Value>>;

const pt: Translations = {
  // Header
  "header.title": "Plano de Gerenciamento de Corrosão",
  "header.departments": "Departamentos:",
  "status.healthy": "SAUDÁVEL",
  "status.attention": "ATENÇÃO",
  "status.degraded": "DEGRADADO",

  // Departments
  "dept.All": "Todos",
  "dept.Drilling": "Perfuração",
  "dept.Maintenance": "Manutenção",
  "dept.Marine": "Marítimo",
  "dept.Safety": "Segurança",
  "dept.Third Party": "Terceirizado",

  // Sidebar
  "nav.dashboard": "Painel",
  "nav.zones": "Zonas e Itens",
  "nav.risk": "Matriz de Risco",
  "nav.schedule": "Cronograma",
  "nav.export": "Exportar",
  "nav.users": "Usuários",
  "nav.audit": "Auditoria",
  "nav.newItem": "+ Novo Item",
  "nav.addItem": "+ Item",
  "nav.signOut": "⏻  Sair",
  "nav.signOutConfirm": "Encerrar sessão?",

  // Footer
  "footer.developedBy": "Desenvolvido por Helcio Yassuo",

  // Common
  "common.loading": "Carregando…",
  "common.generating": "Gerando…",
  "common.saving": "Salvando…",
  "common.save": "Salvar",
  "common.cancel": "Cancelar",
  "common.delete": "Excluir",
  "common.create": "Criar",
  "common.add": "+ Adicionar",
  "common.tryAgain": "Tentar novamente",
  "common.error": "Algo deu errado",
  "common.confirmDelete":
    "Excluir este item? Esta ação não pode ser desfeita.",

  // Dashboard
  "dash.integrityIndex": "Índice de Integridade",
  "dash.inspectionCompliance": "Conformidade de Inspeção",
  "dash.scheduleCompliance": "Conformidade do Cronograma",
  "dash.seceOk": "SECE OK",
  "dash.criticalItemsOk": "Itens Críticos OK",
  "dash.byZone": "Índice de Integridade por Zona",
  "dash.weightedNote": "ponderado: prioridade × SECE",
  "dash.needsTwo": "necessita 2+ itens para calcular o índice",
  "dash.noItems": "Nenhum item registrado",
  "dash.noItemsCta":
    "Vá em Zonas e Itens para adicionar o primeiro ponto de inspeção.",
  "dash.inspected": "inspecionados",
  "dash.overdueDue30": (od: number, d30: number) =>
    `${od} vencidos / ${d30} em 30 dias`,
  "dash.items": "itens",
  "dash.item": "item",

  // Integrity
  "integrity.GOOD": "BOM",
  "integrity.FAIR": "REGULAR",
  "integrity.DEGRADED": "DEGRADADO",
  "integrity.CRITICAL": "CRÍTICO",

  // Priority (display labels — the underlying enum stays English)
  "priority.Critical": "Crítica",
  "priority.High": "Alta",
  "priority.Medium": "Média",
  "priority.Low": "Baixa",

  // Status
  "statusItem.OK": "OK",
  "statusItem.Attention": "Atenção",
  "statusItem.Critical": "Crítico",
  "statusItem.Pending": "Pendente",
  "statusItem.Overdue": "Vencido",

  // Alerts
  "alert.title": "Alertas Ativos",
  "alert.critical": "críticos",
  "alert.warning": "avisos",
  "alert.total": "no total",
  "alert.overdueSince": "inspeção VENCIDA desde",
  "alert.dueIn": "inspeção em",
  "alert.days": "dias",
  "alert.critRate": "taxa crítica de corrosão",
  "alert.elevRate": "taxa elevada de corrosão",

  // Modal sections
  "sec.evidence": "EVIDÊNCIA DE INSPEÇÃO",
  "sec.identification": "IDENTIFICAÇÃO",
  "sec.ifs": "OBJETO IFS",
  "sec.risk": "AVALIAÇÃO DE RISCO",
  "sec.inspection": "INSPEÇÃO E PLANEJAMENTO",
  "sec.pit": "MEDIÇÕES DE PROFUNDIDADE DE PITE (Manual)",
  "sec.history": "HISTÓRICO",
  "sec.notes": "OBSERVAÇÕES",
  "sec.evidenceHint":
    "Comece anexando uma foto. A análise por IA preencherá automaticamente o tipo de corrosão, severidade e prioridade sugerida.",
  "modal.editItem": "Editar Item -",
  "modal.newItem": "Novo Item -",
  "modal.markResolved": "Marcar como Resolvido",
  "modal.resolved": "Resolvido",
  "modal.createItem": "Criar Item",
  "modal.untitled": "Sem nome",

  // Modal fields
  "f.itemName": "Nome / Tag do Item",
  "f.mechanism": "Mecanismo de Corrosão",
  "f.protection": "Proteção Aplicada",
  "f.objectId": "ID / Descrição do Objeto (IFS)",
  "f.wo": "Ordem de Serviço IFS",
  "f.fl": "Local Funcional IFS",
  "f.probability": "Probabilidade (1-5)",
  "f.consequence": "Consequência (1-5)",
  "f.priorityAuto": "Prioridade (auto)",
  "f.status": "Status",
  "f.sece": "SECE (Elemento Crítico de Segurança e Meio Ambiente)",
  "f.seceFromIFS": "vindo do IFS",
  "f.seceSelect": "selecione um Objeto IFS",
  "f.frequency": "Frequência de Inspeção",
  "f.lastInsp": "Última Inspeção",
  "f.nextInsp": "Próxima Inspeção (auto)",
  "f.date": "Data",
  "f.pitDepth": "Profundidade de Pite (mm)",
  "f.location": "Localização / Ponto",
  "f.checkedBy": "Verificado por",
  "f.addReading": "+ Leitura",
  "f.pitRate": "Taxa de Crescimento de Pite",
  "f.photoEv": "Foto / Evidência",
  "f.findingDesc": "Achado / Descrição",
  "f.notes": "Observações",
  "f.notRecorded": "Nenhuma leitura registrada",
  "f.noEvidence": "Nenhuma evidência registrada",
  "f.calculating": "Calculando...",
  "f.setPC": "Defina P + C",
  "f.imageReady":
    "Imagem pronta — clique para executar a análise de corrosão por IA.",
  "f.uploadFirst": "Anexe uma imagem para habilitar a análise por IA.",
  "f.analyse": "🔍 Analisar com IA",
  "f.analysing": "Analisando...",

  // Probability descriptions
  "prob.1": "Nunca ocorreu no Setor",
  "prob.2": "Já ocorreu no Setor",
  "prob.3": "Já ocorreu na Empresa",
  "prob.4": "Múltiplas ocorrências por ano na Empresa",
  "prob.5": "Múltiplas ocorrências por ano na Unidade",
  "cons.1": "Insignificante",
  "cons.2": "Menor",
  "cons.3": "Moderada",
  "cons.4": "Séria",
  "cons.5": "Crítica",
  "risk.legend": "Legenda",

  // SECE
  "sece.yes": "SIM",
  "sece.no": "NÃO",

  // Rate
  "rate.critical": "CRÍTICA - Ação Imediata",
  "rate.severe": "Severa - Aumentar Monitoramento",
  "rate.moderate": "Moderada - Monitorar",
  "rate.stable": "Estável",

  // Risk matrix
  "risk.title": "Matriz de Risco — API 580 / DNV-RP-G101",
  "risk.assessedOf": (with_: number, total: number) =>
    `${with_} de ${total} itens avaliados`,
  "risk.empty.title": "Nenhum item com avaliação de risco",
  "risk.empty.hint":
    "Edite os itens e preencha Probabilidade e Consequência.",
  "risk.highTitle": "Itens de Alto / Crítico Risco (RPN ≥ 8)",

  // Schedule
  "sched.horizon": "Horizonte:",
  "sched.until": "Até",
  "sched.overdue": "Vencidos",
  "sched.dueIn": "Vencem nos próximos",
  "sched.days": "dias",
  "sched.notScheduled": "Sem agendamento",
  "sched.allClear": (h: number) =>
    `Nenhuma inspeção vencida ou prevista nos próximos ${h} dias.`,

  // Export
  "exp.title": "Exportar",
  "exp.itemsSuffix": "itens",
  "exp.format":
    "CSV (lista plana) · XLSX (Itens / Leituras / Evidências / Histórico) · PDF (relatório formatado)",
  "exp.csv": "Exportar CSV",
  "exp.xlsx": "Exportar XLSX",
  "exp.pdf": "Exportar PDF",
  "exp.includePhotos":
    "Incluir fotos de evidência no PDF (até 4 por item — arquivo maior, geração mais lenta)",
  "exp.summary": "Tabela Resumo",
  "exp.pdfFail": "Falha ao exportar PDF.",
};

const dicts: Record<Lang, Translations> = { en, pt };

export function translate(lang: Lang, key: Key): Value {
  return dicts[lang][key] ?? en[key];
}

// Convenience: returns a plain string. If the dict value is a function,
// caller is expected to invoke it themselves with the right args (use the
// `t` helper on the LangContext for that).
export function t(lang: Lang, key: Key): string {
  const v = translate(lang, key);
  return typeof v === "function" ? "" : v;
}

export function tPriority(lang: Lang, p: ItemPriority | null): string {
  if (!p) return "—";
  return translate(lang, `priority.${p}` as Key) as string;
}

export function tStatus(
  lang: Lang,
  s: ItemStatus | EffectiveStatus
): string {
  return translate(lang, `statusItem.${s}` as Key) as string;
}

export function tDept(lang: Lang, d: string): string {
  return (translate(lang, `dept.${d}` as Key) as string) || d;
}

export function tIntegrity(lang: Lang, label: string): string {
  return (translate(lang, `integrity.${label}` as Key) as string) || label;
}

export type DictKey = Key;
