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
  "search.label": "Search items",
  "search.placeholder": "Search items (name, IFS, WO, zone…)  /",
  "search.none": "No items found.",
  "search.count": (n: number) => (n === 1 ? "1 item found." : `${n} items found.`),
  "search.archived": "archived",
  "theme.label": (name: string) => `Theme: ${name}`,
  "theme.system": "device",
  "theme.light": "light",
  "theme.dark": "dark",
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
  "nav.addItem": "+ Item",
  "nav.signOut": "⏻  Sign out",
  "nav.signOutConfirm": "Sign out?",

  // Footer
  "footer.developedBy": "Developed by Helcio Yassuo",

  // Loading / generic
  "common.loading": "Loading…",
  "common.generating": "Generating…",
  "common.saving": "Saving…",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "toast.itemSaved": "Item saved",
  "toast.readingSaved": "Reading saved",
  "toast.evidenceSaved": "Evidence saved",
  "exp.xlsxFail": "XLSX export failed:",
  "exp.photosUnavailable":
    "The report photos could not be loaded — the PDF is generated without them.",
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
    "Start by adding a photo. AI analysis will auto-populate the corrosion type and suggested priority.",
  "modal.editItem": "Edit Item -",
  "modal.newItem": "New Item -",
  "modal.markResolved": "Mark as Resolved",
  "modal.resolved": "Resolved",
  "modal.createItem": "Create Item",
  "modal.untitled": "Untitled",
  "modal.pendingAiReading":
    "AI pit-depth estimate — saved as a reading when you save the item:",
  "modal.unsavedEvidence":
    "There is an unsaved evidence entry (photo/description). OK = continue and discard it. Cancel = go back and save it first.",
  "modal.nameRequired": "Item name is required.",
  "modal.saveFailed":
    "Not saved — your changes are still here. Check the connection and try again.",
  "modal.deleteFailed": "Could not delete:",
  "modal.deletedElsewhere": "This item was deleted by another user.",
  "modal.conflict":
    "Someone else changed this item while you were editing. Nothing was saved yet.",
  "modal.conflictOverwrite": "Save my changes on top",
  "modal.conflictReload": "Discard mine and load theirs",
  "modal.discardChanges": "Discard your unsaved changes?",
  "modal.discardNew":
    "Discard this new item? Photos and readings already attached to it will be deleted too.",
  "modal.draftFound": "Unsaved changes from a previous session were found",
  "modal.draftRestore": "Restore",
  "modal.draftDiscard": "Discard",
  "readings.invalidDepth": "Enter a depth between 0 and 999.999 mm.",
  "readings.futureDate": "The reading date cannot be in the future.",
  "readings.missingDate": "Enter the reading date.",
  "readings.saveFailed": "Reading not saved:",
  "readings.confirmDelete": "Delete this reading?",
  "evidence.confirmDelete": "Delete this evidence and its photo?",
  "evidence.batchLimit": (n: number) => `Up to ${n} photos at a time — only the first ${n} were kept.`,
  "evidence.batchProgress": (i: number, n: number) => `Saving ${i} of ${n}…`,
  "evidence.morePhotos": (n: number) => `+${n} more`,
  "evidence.preparing": (n: number) => (n === 1 ? "Preparing the photo…" : `Preparing ${n} photos…`),
  "evidence.batchKept": (saved: number, n: number) =>
    `(${saved} of ${n} saved — Save again for the other ${n - saved}.)`,
  "evidence.saveMany": (n: number) => `Save ${n} evidence records`,
  "toast.evidencesSaved": (n: number) => `${n} evidence records saved`,
  "evidence.saveFailed": "Evidence not saved:",
  "common.deleteFailed": "Could not delete:",
  "ai.timeout": "The AI analysis took too long. Try again.",
  "common.dismiss": "Dismiss",
  "common.close": "Close",
  "modal.discardAiReading": "Discard AI reading",
  "newItem.pickZone": "New item — choose a zone",
  "audit.allActions": "All actions",
  "audit.allUsers": "All users",
  "ai.type": "Type",
  "ai.prob": "Prob",
  "ai.cons": "Cons",
  "ai.action": "Action",
  "ai.area": "Area affected",
  "ai.pitDepth": "Est. pit depth",
  "ifs.label": "Object ID / Description (IFS)",
  "f.objectIdShort": "Object ID",
  "f.objectDesc": "Object description",
  "ifs.placeholder": "Type Object ID or description…",
  "ifs.clear": "Clear IFS object",
  "ifs.searching": "Searching IFS…",
  "ifs.seceNote": "SECE — Safety & Environmental Critical Element",
  "nav.main": "Main navigation",
  "nav.menu": "Menu",
  "navShort.dashboard": "Home",
  "navShort.zones": "Zones",
  "navShort.risk": "Risk",
  "navShort.schedule": "Schedule",
  "navShort.export": "Export",
  "f.takePhoto": "Take photo",
  "f.fromGallery": "Gallery / file",
  "f.photoPreview": "Selected photo preview",
  "login.title1": "CORROSION",
  "login.title2": "MANAGEMENT PLAN",
  "login.email": "Email",
  "login.emailPh": "Enter your email",
  "login.password": "Password",
  "login.passwordPh": "Enter your password",
  "login.signIn": "Sign in",
  "login.signingIn": "Signing in…",
  "login.missing": "Enter your email and password.",
  "login.invalid": "Invalid email or password.",
  "login.network": "Can't reach the server. Check the connection and try again.",
  "login.help": "Contact your administrator for access credentials.",
  "login.forgot": "Forgot password?",
  "login.forgotNeedEmail": "Type your email above, then tap “Forgot password?”.",
  "login.forgotSent": "If this email has an active account, a reset link is on its way.",
  "login.inactive": "This account is deactivated. Contact your administrator.",
  "login.forgotLimit": "Too many reset emails. Wait a few minutes and try again.",
  "reset.title": "Set a new password",
  "reset.checking": "Checking the link…",
  "reset.invalid": "This reset link is invalid, was already used or has expired. Ask your administrator for a new one, or use “Forgot password?” on the sign-in page.",
  "reset.backToLogin": "Back to sign in",
  "reset.new": "New password",
  "reset.confirm": "Repeat the new password",
  "reset.rule": "At least 8 characters.",
  "reset.tooShort": "The password needs at least 8 characters.",
  "reset.mismatch": "The two passwords don't match.",
  "reset.save": "Save new password",
  "reset.done": "Password changed. Opening the app…",
  "reset.same": "Choose a password different from the current one.",
  "reset.weak": "This password is too weak. Use a longer one, mixing letters, numbers and symbols.",
  "idle.warning":
    "You'll be signed out in 2 minutes for inactivity. Unsaved item changes are kept on this device.",
  "idle.stay": "Stay signed in",
  "net.offline":
    "Offline — changes can't be saved until the connection is back. Your typing is kept.",
  "audit.truncated":
    "Showing the most recent events only — narrow the date range to see older ones.",
  "audit.loadFailed": "Could not load the audit log:",
  "modal.archive": "Archive",
  "modal.unarchive": "Unarchive",

  // Sub-áreas (compartments inside a zone)
  "f.subarea": "Sub-area",
  "subarea.none": "No sub-area",
  "subarea.add": "+ new sub-area",
  "subarea.namePlaceholder": "Sub-area name (e.g. Shaker Room)",

  // Tratativa (corrective-action cycle)
  "sec.action": "CORRECTIVE ACTION (TRATATIVA)",
  "f.actionType": "Action type",
  "f.actionStatus": "Action status",
  "f.actionDue": "Target date",
  "f.actionDueSuggested": "suggested from priority — editable",
  "f.actionNote": "Action notes",
  "f.actionDoneHint":
    "Done ≠ resolved: confirm the item's condition on re-inspection before marking it resolved.",
  "actionType.Monitorar": "Monitor",
  "actionType.Tratamento mecânico e pintura": "Mechanical treatment + painting",
  "actionType.Caldeiraria + tratamento e pintura":
    "Boilermaking + treatment + painting",
  "actionType.Reparo compósito": "Composite repair",
  "actionType.Substituição": "Replacement",
  "actionType.Outro": "Other",
  "actionStatus.Sem planejamento": "Not planned",
  "actionStatus.Planejado": "Planned",
  "actionStatus.Aguardando material": "Awaiting material",
  "actionStatus.Em execução": "In progress",
  "actionStatus.Executado": "Done",
  "alert.actionOverdue": "action OVERDUE since",
  "sched.actionsOverdue": "Overdue actions",
  "dash.openActions": "Open actions",
  "dash.openActionsSub": (od: number) => `${od} overdue`,
  "badge.action": "Action",

  // Assessment bands (informative only)
  "f.corrExtent": "Corrosion extent (%)",
  "f.materialLoss": "Material loss (%)",
  "f.bandsInfo": "Informative only — does not affect priority.",

  // Line accessory
  "f.isAccessory": "Line accessory",
  "f.isAccessoryHint":
    "The IFS object identifies the parent LINE (piping); this item is an accessory installed on it.",
  "f.accessoryType": "Accessory type",
  "accType.Suporte": "Support",
  "accType.Válvula": "Valve",
  "accType.Flange": "Flange",
  "accType.Outro": "Other",

  // Modal field labels
  "f.itemName": "Item Name / Tag",
  "f.zone": "Zone",
  "f.mechanism": "Corrosion Mechanism",
  "f.protection": "Applied Protection",
  "f.objectId": "Object ID / Description (IFS)",
  "f.wo": "IFS Work Order",
  "f.probability": "Probability (1-5)",
  "f.consequence": "Consequence (1-5)",
  "f.priorityAuto": "Priority (auto)",
  "f.status": "Status",
  "f.sece": "SECE (Safety & Environmental Critical Element)",
  "f.seceSelect": "select an IFS Object",
  "f.dropsRisk": "DROPS risk",
  "f.structural": "Structural element",
  "f.obsSource": "Observation source",
  "obsSrc.Routine Inspection": "Routine Inspection",
  "obsSrc.Eventual Inspection": "Eventual Inspection",
  "obsSrc.3C Card": "3C Card",
  "obsSrc.Petrobras Pending": "Petrobras Pending",
  "obsSrc.Other": "Other",
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
  "f.addEvidenceTitle": "Add new evidence",
  "f.saveEvidence": "Save evidence record",
  "f.step1": "1. Attach a photo or PDF",
  "f.step2": "2. (Optional) Run AI analysis",
  "f.step3": "3. Confirm date and description",
  "f.step4": "4. Save the record",
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
  "risk.level.Low": "Low risk",
  "risk.level.Medium": "Medium risk",
  "risk.level.High": "High risk",
  "risk.level.Critical": "Critical risk",
  "risk.legend": "Legend",

  // SECE display
  "sece.yes": "YES",
  "sece.no": "NO",
  "sece.na": "—",

  // Rate hints
  "rate.insufficient":
    "Corrosion rate: not enough data yet — needs 2 measurements at the same point, at least 90 days apart.",
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
  "exp.scope": "What to export",
  "exp.scopeDept": (d: string) => `Only ${d}`,
  "exp.scopeAll": "All departments",
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

  // Generic select placeholder
  "select.placeholder": "-- select --",

  // Status enum
  "statusOpt.OK": "OK",
  "statusOpt.Attention": "Attention",
  "statusOpt.Critical": "Critical",
  "statusOpt.Pending": "Pending",

  // Corrosion mechanisms (display labels; DB stores English)
  "mech.Atmospheric Corrosion": "Atmospheric Corrosion",
  "mech.CO2 Corrosion (Sweet)": "CO2 Corrosion (Sweet)",
  "mech.Corrosion Fatigue": "Corrosion Fatigue",
  "mech.Crevice Corrosion": "Crevice Corrosion",
  "mech.Erosion-Corrosion": "Erosion-Corrosion",
  "mech.Galvanic Corrosion": "Galvanic Corrosion",
  "mech.H2S Corrosion (Sour Service)": "H2S Corrosion (Sour Service)",
  "mech.MIC (Microbiologically Influenced)": "MIC (Microbiologically Influenced)",
  "mech.Pitting Corrosion": "Pitting Corrosion",
  "mech.Uniform Corrosion": "Uniform Corrosion",

  // Protections
  "prot.Epoxy Coating (C5-M)": "Epoxy Coating (C5-M)",
  "prot.Internal Epoxy Coating (PSPC)": "Internal Epoxy Coating (PSPC)",
  "prot.Splash Zone Compound": "Splash Zone Compound",
  "prot.Sacrificial Anodes Al-Zn-In": "Sacrificial Anodes Al-Zn-In",
  "prot.ICCP (Impressed Current)": "ICCP (Impressed Current)",
  "prot.Anodes + Coating": "Anodes + Coating",
  "prot.Resistant Material (Duplex/316L)": "Resistant Material (Duplex/316L)",
  "prot.NACE MR0175/ISO 15156": "NACE MR0175/ISO 15156",
  "prot.Corrosion Inhibitor": "Corrosion Inhibitor",
  "prot.Special Greases / Lubricants": "Special Greases / Lubricants",
  "prot.No Specific Protection": "No Specific Protection",
  "prot.Other": "Other",

  // Inspection frequencies
  "freq.Weekly": "Weekly",
  "freq.Monthly": "Monthly",
  "freq.Quarterly": "Quarterly (every 3 months)",
  "freq.Semi-annual": "Semi-annual (every 6 months)",
  "freq.Annual": "Annual (once a year)",
  "freq.Every 2 years": "Every 2 years",
  "freq.Every 2.5 years": "Every 2.5 years (SPS / Dry Dock)",
  "freq.Every 5 years": "Every 5 years (Special Survey)",
  "freq.Per operation": "Per operation (pre/post use)",
  "freq.As required": "As required / Condition-based",

  // Priority-logic explanation (RISK ASSESSMENT section)
  "f.priorityLogicLabel": "Priority logic:",
  "f.priorityLogicBody":
    "RPN (P×C) × SECE (1.5× if YES) + DROPS (+2) + Structural (+2) + Overdue penalty (+5) or Due soon (+2). ",
  "f.priorityLogicTiers": "<6=Low • 6-12=Medium • 13-21=High • ≥22=Critical",

  // Readings table headers
  "tbl.date": "Date",
  "tbl.depth": "Depth (mm)",
  "tbl.change": "Change",
  "tbl.location": "Location",
  "tbl.inspector": "Inspector",
  "f.aiAnalysing": "AI is analysing the photo...",
  "f.optimised": "Optimised",
  "f.choose": "Choose file…",
  "f.uploadFailed": "Photo upload failed:",
} satisfies DictMap;

type Key = keyof typeof en;
type Translations = Partial<Record<Key, Value>>;

const pt: Translations = {
  // Header
  "header.title": "Plano de Gerenciamento de Corrosão",
  "search.label": "Buscar itens",
  "search.placeholder": "Buscar itens (nome, IFS, OS, zona…)  /",
  "search.none": "Nenhum item encontrado.",
  "search.count": (n: number) => (n === 1 ? "1 item encontrado." : `${n} itens encontrados.`),
  "search.archived": "arquivado",
  "theme.label": (name: string) => `Tema: ${name}`,
  "theme.system": "do aparelho",
  "theme.light": "claro",
  "theme.dark": "escuro",
  "header.departments": "Departamentos:",
  "status.healthy": "SAUDÁVEL",
  "status.attention": "ATENÇÃO",
  "status.degraded": "DEGRADADO",

  // Departments
  "dept.All": "Todos",
  "dept.Drilling": "Perfuração",
  "dept.Maintenance": "Manutenção",
  "dept.Marine": "Marinha",
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
  "common.confirm": "Confirmar",
  "toast.itemSaved": "Item salvo",
  "toast.readingSaved": "Leitura salva",
  "toast.evidenceSaved": "Evidência salva",
  "exp.xlsxFail": "Falha ao exportar XLSX:",
  "exp.photosUnavailable":
    "Não foi possível carregar as fotos do relatório — o PDF será gerado sem elas.",
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
    "Comece anexando uma foto. A análise por IA preencherá automaticamente o tipo de corrosão e a prioridade sugerida.",
  "modal.editItem": "Editar Item -",
  "modal.newItem": "Novo Item -",
  "modal.markResolved": "Marcar como Resolvido",
  "modal.resolved": "Resolvido",
  "modal.createItem": "Criar Item",
  "modal.untitled": "Sem nome",
  "modal.pendingAiReading":
    "Estimativa de profundidade (IA) — será salva como leitura ao salvar o item:",
  "modal.unsavedEvidence":
    "Há uma evidência não salva (foto/descrição). OK = continuar e descartar. Cancelar = voltar e salvá-la primeiro.",
  "modal.nameRequired": "O nome do item é obrigatório.",
  "modal.saveFailed":
    "Não salvo — suas alterações continuam aqui. Verifique a conexão e tente novamente.",
  "modal.deleteFailed": "Não foi possível excluir:",
  "modal.deletedElsewhere": "Este item foi excluído por outro usuário.",
  "modal.conflict":
    "Outra pessoa alterou este item enquanto você editava. Nada foi salvo ainda.",
  "modal.conflictOverwrite": "Salvar minhas alterações por cima",
  "modal.conflictReload": "Descartar as minhas e carregar as dela",
  "modal.discardChanges": "Descartar as alterações não salvas?",
  "modal.discardNew":
    "Descartar este item novo? As fotos e leituras já anexadas também serão excluídas.",
  "modal.draftFound": "Foram encontradas alterações não salvas de uma sessão anterior",
  "modal.draftRestore": "Restaurar",
  "modal.draftDiscard": "Descartar",
  "readings.invalidDepth": "Informe uma profundidade entre 0 e 999,999 mm.",
  "readings.futureDate": "A data da leitura não pode ser futura.",
  "readings.missingDate": "Informe a data da leitura.",
  "readings.saveFailed": "Leitura não salva:",
  "readings.confirmDelete": "Excluir esta leitura?",
  "evidence.confirmDelete": "Excluir esta evidência e a foto?",
  "evidence.batchLimit": (n: number) => `Até ${n} fotos por vez — só as ${n} primeiras foram mantidas.`,
  "evidence.batchProgress": (i: number, n: number) => `Salvando ${i} de ${n}…`,
  "evidence.morePhotos": (n: number) => `+${n} ${n === 1 ? "arquivo" : "arquivos"}`,
  "evidence.preparing": (n: number) => (n === 1 ? "Preparando a foto…" : `Preparando ${n} fotos…`),
  "evidence.batchKept": (saved: number, n: number) =>
    `(${saved} de ${n} salvas — salve de novo para as outras ${n - saved}.)`,
  "evidence.saveMany": (n: number) => `Salvar ${n} registros de evidência`,
  "toast.evidencesSaved": (n: number) => `${n} evidências salvas`,
  "evidence.saveFailed": "Evidência não salva:",
  "common.deleteFailed": "Não foi possível excluir:",
  "ai.timeout": "A análise por IA demorou demais. Tente novamente.",
  "common.dismiss": "Fechar",
  "common.close": "Fechar",
  "modal.discardAiReading": "Descartar leitura da IA",
  "newItem.pickZone": "Novo item — escolha a zona",
  "audit.allActions": "Todas as ações",
  "audit.allUsers": "Todos os usuários",
  "ai.type": "Tipo",
  "ai.prob": "Prob",
  "ai.cons": "Cons",
  "ai.action": "Ação",
  "ai.area": "Área afetada",
  "ai.pitDepth": "Prof. estimada",
  "ifs.label": "ID / descrição do objeto (IFS)",
  "f.objectIdShort": "ID do objeto",
  "f.objectDesc": "Descrição do objeto",
  "ifs.placeholder": "Digite o ID ou a descrição do objeto…",
  "ifs.clear": "Limpar objeto IFS",
  "ifs.searching": "Buscando no IFS…",
  "ifs.seceNote": "SECE — Elemento Crítico de Segurança e Meio Ambiente",
  "nav.main": "Navegação principal",
  "nav.menu": "Menu",
  "navShort.dashboard": "Início",
  "navShort.zones": "Zonas",
  "navShort.risk": "Risco",
  "navShort.schedule": "Agenda",
  "navShort.export": "Exportar",
  "f.takePhoto": "Tirar foto",
  "f.fromGallery": "Galeria / arquivo",
  "f.photoPreview": "Prévia da foto selecionada",
  "login.title1": "PLANO DE GERENCIAMENTO",
  "login.title2": "DE CORROSÃO",
  "login.email": "E-mail",
  "login.emailPh": "Digite seu e-mail",
  "login.password": "Senha",
  "login.passwordPh": "Digite sua senha",
  "login.signIn": "Entrar",
  "login.signingIn": "Entrando…",
  "login.missing": "Informe e-mail e senha.",
  "login.invalid": "E-mail ou senha inválidos.",
  "login.network": "Sem comunicação com o servidor. Verifique a conexão e tente novamente.",
  "login.help": "Solicite suas credenciais ao administrador.",
  "login.forgot": "Esqueci minha senha",
  "login.forgotNeedEmail": "Digite seu e-mail acima e toque em “Esqueci minha senha”.",
  "login.forgotSent": "Se este e-mail tiver uma conta ativa, um link de redefinição foi enviado.",
  "login.inactive": "Esta conta está desativada. Fale com o administrador.",
  "login.forgotLimit": "Muitos e-mails de redefinição. Aguarde alguns minutos e tente de novo.",
  "reset.title": "Definir nova senha",
  "reset.checking": "Verificando o link…",
  "reset.invalid": "Este link de redefinição é inválido, já foi usado ou expirou. Peça um novo ao administrador ou use “Esqueci minha senha” na tela de entrada.",
  "reset.backToLogin": "Voltar para a entrada",
  "reset.new": "Nova senha",
  "reset.confirm": "Repita a nova senha",
  "reset.rule": "Pelo menos 8 caracteres.",
  "reset.tooShort": "A senha precisa de pelo menos 8 caracteres.",
  "reset.mismatch": "As duas senhas não conferem.",
  "reset.save": "Salvar nova senha",
  "reset.done": "Senha alterada. Abrindo o app…",
  "reset.same": "Escolha uma senha diferente da atual.",
  "reset.weak": "Senha fraca demais. Use uma mais longa, misturando letras, números e símbolos.",
  "idle.warning":
    "Você será desconectado em 2 minutos por inatividade. Alterações não salvas de itens ficam guardadas neste aparelho.",
  "idle.stay": "Continuar conectado",
  "net.offline":
    "Sem conexão — nada pode ser salvo até a rede voltar. O que você digitou fica guardado.",
  "audit.truncated":
    "Exibindo apenas os eventos mais recentes — reduza o período para ver os mais antigos.",
  "audit.loadFailed": "Não foi possível carregar o log de auditoria:",
  "modal.archive": "Arquivar",
  "modal.unarchive": "Desarquivar",

  // Sub-áreas
  "f.subarea": "Sub-área",
  "subarea.none": "Sem sub-área",
  "subarea.add": "+ nova sub-área",
  "subarea.namePlaceholder": "Nome da sub-área (ex: Sala de Peneiras)",

  // Tratativa
  "sec.action": "TRATATIVA",
  "f.actionType": "Tipo de tratativa",
  "f.actionStatus": "Status da tratativa",
  "f.actionDue": "Prazo",
  "f.actionDueSuggested": "sugerido pela prioridade — editável",
  "f.actionNote": "Observações da tratativa",
  "f.actionDoneHint":
    "Executado ≠ resolvido: confirme a condição do item na reinspeção antes de marcá-lo como resolvido.",
  "actionType.Monitorar": "Monitorar",
  "actionType.Tratamento mecânico e pintura": "Tratamento mecânico e pintura",
  "actionType.Caldeiraria + tratamento e pintura":
    "Caldeiraria + tratamento e pintura",
  "actionType.Reparo compósito": "Reparo compósito",
  "actionType.Substituição": "Substituição",
  "actionType.Outro": "Outro",
  "actionStatus.Sem planejamento": "Sem planejamento",
  "actionStatus.Planejado": "Planejado",
  "actionStatus.Aguardando material": "Aguardando material",
  "actionStatus.Em execução": "Em execução",
  "actionStatus.Executado": "Executado",
  "alert.actionOverdue": "tratativa VENCIDA desde",
  "sched.actionsOverdue": "Tratativas vencidas",
  "dash.openActions": "Tratativas abertas",
  "dash.openActionsSub": (od: number) => `${od} vencidas`,
  "badge.action": "Tratativa",

  // Faixas informativas
  "f.corrExtent": "% de corrosão (extensão)",
  "f.materialLoss": "% de perda de material",
  "f.bandsInfo": "Apenas informativo — não afeta a prioridade.",

  // Acessório da linha
  "f.isAccessory": "Acessório da linha",
  "f.isAccessoryHint":
    "O objeto IFS identifica a LINHA (tubulação); este item é um acessório instalado nela.",
  "f.accessoryType": "Tipo de acessório",
  "accType.Suporte": "Suporte",
  "accType.Válvula": "Válvula",
  "accType.Flange": "Flange",
  "accType.Outro": "Outro",

  // Modal fields
  "f.itemName": "Nome / Tag do Item",
  "f.zone": "Zona",
  "f.mechanism": "Mecanismo de Corrosão",
  "f.protection": "Proteção Aplicada",
  "f.objectId": "ID / Descrição do Objeto (IFS)",
  "f.wo": "Ordem de Serviço IFS",
  "f.probability": "Probabilidade (1-5)",
  "f.consequence": "Consequência (1-5)",
  "f.priorityAuto": "Prioridade (auto)",
  "f.status": "Status",
  "f.sece": "SECE (Elemento Crítico de Segurança e Meio Ambiente)",
  "f.seceSelect": "selecione um Objeto IFS",
  "f.dropsRisk": "Risco de DROPS",
  "f.structural": "Elemento estrutural",
  "f.obsSource": "Fonte da observação",
  "obsSrc.Routine Inspection": "Inspeção Rotineira",
  "obsSrc.Eventual Inspection": "Inspeção Eventual",
  "obsSrc.3C Card": "Cartão 3C",
  "obsSrc.Petrobras Pending": "Pendência Petrobras",
  "obsSrc.Other": "Outro",
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
  "f.addEvidenceTitle": "Adicionar nova evidência",
  "f.saveEvidence": "Salvar registro de evidência",
  "f.step1": "1. Anexe uma foto ou PDF",
  "f.step2": "2. (Opcional) Execute análise por IA",
  "f.step3": "3. Confirme a data e a descrição",
  "f.step4": "4. Salve o registro",
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
  "risk.level.Low": "Risco baixo",
  "risk.level.Medium": "Risco médio",
  "risk.level.High": "Risco alto",
  "risk.level.Critical": "Risco crítico",
  "risk.legend": "Legenda",

  // SECE
  "sece.yes": "SIM",
  "sece.no": "NÃO",

  // Rate
  "rate.insufficient":
    "Taxa de corrosão: dados insuficientes — são necessárias 2 medições no mesmo ponto, com pelo menos 90 dias entre elas.",
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
  "exp.scope": "O que exportar",
  "exp.scopeDept": (d: string) => `Só ${d}`,
  "exp.scopeAll": "Todos os departamentos",
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

  "select.placeholder": "-- selecione --",

  "statusOpt.OK": "OK",
  "statusOpt.Attention": "Atenção",
  "statusOpt.Critical": "Crítico",
  "statusOpt.Pending": "Pendente",

  "mech.Atmospheric Corrosion": "Corrosão Atmosférica",
  "mech.CO2 Corrosion (Sweet)": "Corrosão por CO2 (Doce)",
  "mech.Corrosion Fatigue": "Fadiga por Corrosão",
  "mech.Crevice Corrosion": "Corrosão em Frestas",
  "mech.Erosion-Corrosion": "Erosão-Corrosão",
  "mech.Galvanic Corrosion": "Corrosão Galvânica",
  "mech.H2S Corrosion (Sour Service)": "Corrosão por H2S (Serviço Ácido)",
  "mech.MIC (Microbiologically Influenced)":
    "MIC (Influenciada por Microrganismos)",
  "mech.Pitting Corrosion": "Corrosão por Pites",
  "mech.Uniform Corrosion": "Corrosão Uniforme",

  "prot.Epoxy Coating (C5-M)": "Revestimento Epóxi (C5-M)",
  "prot.Internal Epoxy Coating (PSPC)": "Revestimento Epóxi Interno (PSPC)",
  "prot.Splash Zone Compound": "Composto de Zona de Borrifo",
  "prot.Sacrificial Anodes Al-Zn-In": "Anodos de Sacrifício Al-Zn-In",
  "prot.ICCP (Impressed Current)": "ICCP (Corrente Impressa)",
  "prot.Anodes + Coating": "Anodos + Revestimento",
  "prot.Resistant Material (Duplex/316L)": "Material Resistente (Duplex/316L)",
  "prot.NACE MR0175/ISO 15156": "NACE MR0175/ISO 15156",
  "prot.Corrosion Inhibitor": "Inibidor de Corrosão",
  "prot.Special Greases / Lubricants": "Graxas / Lubrificantes Especiais",
  "prot.No Specific Protection": "Sem Proteção Específica",
  "prot.Other": "Outro",

  "freq.Weekly": "Semanal",
  "freq.Monthly": "Mensal",
  "freq.Quarterly": "Trimestral (cada 3 meses)",
  "freq.Semi-annual": "Semestral (cada 6 meses)",
  "freq.Annual": "Anual (uma vez por ano)",
  "freq.Every 2 years": "A cada 2 anos",
  "freq.Every 2.5 years": "A cada 2,5 anos (SPS / Dique Seco)",
  "freq.Every 5 years": "A cada 5 anos (Vistoria Especial)",
  "freq.Per operation": "Por operação (pré/pós uso)",
  "freq.As required": "Conforme necessidade / Baseada em condição",

  "f.priorityLogicLabel": "Lógica de prioridade:",
  "f.priorityLogicBody":
    "RPN (P×C) × SECE (1,5× se SIM) + DROPS (+2) + Estrutural (+2) + vencimento (+5) ou próximo (+2). ",
  "f.priorityLogicTiers":
    "<6=Baixa • 6-12=Média • 13-21=Alta • ≥22=Crítica",

  "tbl.date": "Data",
  "tbl.depth": "Profundidade (mm)",
  "tbl.change": "Variação",
  "tbl.location": "Localização",
  "tbl.inspector": "Inspetor",
  "f.aiAnalysing": "IA analisando a foto...",
  "f.optimised": "Otimizada",
  "f.choose": "Escolher arquivo…",
  "f.uploadFailed": "Falha no envio da foto:",
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
