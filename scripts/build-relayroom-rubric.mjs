import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputPath = path.resolve("RelayRoom_Inferred_Rubric.xlsx");

const rows = [
  [1, "Deliverables & Setup", 1, "No", "Repo runs locally, README/setup is usable, environment requirements are clear, and the app can be evaluated without hidden manual steps."],
  [2, "Architecture Overview", 1, "No", "Clear explanation of data flow, OAuth boundaries, queue lifecycle, polling/webhook approach, and notable implementation decisions."],
  [3, "Google Sign-In", 1, "No", "NextAuth/Google sign-in works, allowed users are enforced, unauthorized users get a clear message, and session state is visible in the UI."],
  [4, "Multi-User Workspace", 1, "No", "Workspace data is visible across users while protected actions are limited to the owner/connection holder as intended."],
  [5, "Owner/User Controls", 1, "No", "Owner can manage access, disabled users are blocked, and user/account state is surfaced cleanly."],
  [6, "Drive OAuth Connection", 1, "No", "Drive OAuth grants are stored securely, reconnect/disconnect flows work, and connection health is understandable."],
  [7, "YouTube OAuth Connection", 1, "No", "YouTube OAuth grants are stored securely, playlist access works, reconnect/disconnect flows work, and errors are recoverable."],
  [8, "Token Lifecycle", 1, "No", "Refresh tokens are encrypted, refresh failures are handled, secrets fail fast when misconfigured, and token errors are actionable."],
  [9, "Google Picker", 1, "No", "Folder selection uses Google Picker, grants access to the selected folder, handles API-key setup, and falls back gracefully when unavailable."],
  [10, "Pipeline Creation", 1, "No", "Users can create a pipeline with Drive connection, YouTube destination, folder, privacy, mode, and cadence."],
  [11, "Pipeline Editing", 1, "No", "Existing pipelines can be edited without losing queue history or silently changing ownership/security boundaries."],
  [12, "Duplicate Folder/Pipeline Handling", 1, "No", "The app prevents or clearly explains duplicate watched-folder conflicts and avoids accidental double processing."],
  [13, "Rule Builder", 2, "Yes", "Rules can be created through a visual interface using match field, operator, value, playlist target, priority/order, and case sensitivity."],
  [14, "Rule Editing", 2, "Yes", "Rules can be edited, removed, and reordered without page churn or hidden state loss."],
  [15, "Rule Evaluation", 2, "Yes", "First-match routing is deterministic, rule traces are recorded, unmatched items are routed to a recoverable state, and edge cases are handled."],
  [16, "Detection / Polling", 2, "Yes", "Manual and scheduled detection find eligible Drive videos, respect cadence, and expose clear summaries."],
  [17, "Cold-Start Watermark", 2, "Yes", "Enabling a pipeline sets a cold-start watermark so older files are not unexpectedly queued."],
  [18, "Idempotency", 2, "Yes", "Repeated detection does not create duplicate queue items or repeat uploads, and already-seen files are explained."],
  [19, "Unsupported Files", 1, "No", "Non-video files such as JPEG/PDF and unsupported MIME types are ignored or flagged without breaking detection."],
  [20, "Corrupt/Bad Video Handling", 1, "No", "Corrupted or unreadable videos fail cleanly with queue visibility and recovery options."],
  [21, "YouTube Upload", 2, "Yes", "Approved/routed queue items upload to YouTube with the right privacy and playlist assignment."],
  [22, "Upload Failure Recovery", 2, "Yes", "Failed uploads, playlist-add failures, partial successes, retries, and external/manual handling paths are reliable."],
  [23, "Operations Queue", 2, "Yes", "Queue shows every detected item with status, rule, playlist, timestamps, filters, and owner/workspace context."],
  [24, "Queue Actions", 2, "Yes", "Approve, retry, skip, restore, route, mark handled, and open-result actions work with correct permissions and clear pending states."],
  [25, "Activity & Details", 2, "Yes", "Queue detail panels show status history, errors, upload attempts, activity logs, and decision context."],
  [26, "Dashboard Filtering/Sorting", 1, "No", "Users can filter by status, pipeline, owner/user, and sort by relevant dates or activity."],
  [27, "Read-Only API", 1, "No", "Read-only API endpoints are documented, authenticated, scoped appropriately, and safe for automation use."],
  [28, "Security & Permissions", 1, "No", "IDOR, CSRF/origin, cron auth, OAuth ownership, secrets, and API-key controls are handled defensively."],
  [29, "UX Polish", 1, "No", "The app has polished visual states, privacy mode, helpful errors, no full-page flashes, accessible controls, and consistent branding."],
  [30, "Mobile Responsiveness", 1, "No", "Dashboard, pipelines, connections, settings, and queue details are usable on mobile without horizontal layout breakage."],
];

const scaleRows = [
  [0, "Missing / broken / not attempted", "Does not satisfy the requirement or prevents evaluation."],
  [1, "Partial", "Some visible work is present, but the flow is incomplete, fragile, or only works in narrow conditions."],
  [2, "Meets requirement", "Works end-to-end for the expected case with reasonable error handling and clarity."],
  [3, "Exceeds", "Robust, polished, secure, well-documented, and handles edge cases gracefully."],
];

const workbook = Workbook.create();
const rubric = workbook.worksheets.add("Rubric");
const summary = workbook.worksheets.add("Section Summary");
const scale = workbook.worksheets.add("Scoring Scale");

rubric.getRange("A1:H1").values = [[
  "Item #",
  "Section",
  "Weight",
  "Centerpiece",
  "What to look for",
  "Score (0-3)",
  "Weighted Score",
  "Notes",
]];

rubric.getRange(`A2:E${rows.length + 1}`).values = rows;
rubric.getRange(`F2:F${rows.length + 1}`).values = rows.map(() => [null]);
rubric.getRange(`G2:G${rows.length + 1}`).formulas = rows.map((_, index) => [`=IF(F${index + 2}="","",F${index + 2}*C${index + 2})`]);
rubric.getRange(`H2:H${rows.length + 1}`).values = rows.map(() => [""]);

const totalRow = rows.length + 3;
rubric.getRange(`F${totalRow}:G${totalRow + 3}`).values = [
  ["Weighted points", null],
  ["Max weighted points", null],
  ["Final score / 10", null],
  ["Completion %", null],
];
rubric.getRange(`G${totalRow}:G${totalRow + 3}`).formulas = [
  [`=SUM(G2:G${rows.length + 1})`],
  [`=SUM(C2:C${rows.length + 1})*3`],
  [`=IFERROR(G${totalRow}/G${totalRow + 1}*10,"")`],
  [`=IFERROR(G${totalRow}/G${totalRow + 1},"")`],
];

const sections = rows.map((row) => row[1]);
summary.getRange("A1:F1").values = [["Section", "Weight", "Score", "Max", "Completion", "Notes"]];
summary.getRange(`A2:A${sections.length + 1}`).values = sections.map((section) => [section]);
summary.getRange(`B2:B${sections.length + 1}`).formulas = sections.map((section) => [`=SUMIF(Rubric!B:B,A${sections.indexOf(section) + 2},Rubric!C:C)`]);
summary.getRange(`C2:C${sections.length + 1}`).formulas = sections.map((_, index) => [`=SUMIF(Rubric!B:B,A${index + 2},Rubric!G:G)`]);
summary.getRange(`D2:D${sections.length + 1}`).formulas = sections.map((_, index) => [`=B${index + 2}*3`]);
summary.getRange(`E2:E${sections.length + 1}`).formulas = sections.map((_, index) => [`=IFERROR(C${index + 2}/D${index + 2},"")`]);
summary.getRange(`F2:F${sections.length + 1}`).values = sections.map(() => [""]);
summary.getRange(`A${sections.length + 3}:E${sections.length + 6}`).values = [
  ["Total weighted points", null, null, null, null],
  ["Max weighted points", null, null, null, null],
  ["Final score / 10", null, null, null, null],
  ["Completion %", null, null, null, null],
];
summary.getRange(`B${sections.length + 3}:B${sections.length + 6}`).formulas = [
  [`=Rubric!G${totalRow}`],
  [`=Rubric!G${totalRow + 1}`],
  [`=Rubric!G${totalRow + 2}`],
  [`=Rubric!G${totalRow + 3}`],
];

scale.getRange("A1:C1").values = [["Score", "Meaning", "Interpretation"]];
scale.getRange("A2:C5").values = scaleRows;
scale.getRange("A7:B11").values = [
  ["How to use this workbook", ""],
  ["1", "Score each row on the Rubric tab from 0 to 3."],
  ["2", "Weights are already applied. Centerpiece items are weighted 2x."],
  ["3", "Use Notes for evidence, links, screenshots, or reviewer concerns."],
  ["4", "The Section Summary and final /10 score recalculate automatically."],
];

rubric.getRange(`F2:F${rows.length + 1}`).dataValidation = {
  allowBlank: true,
  list: { inCellDropDown: true, source: [0, 1, 2, 3] },
  errorAlert: {
    style: "stop",
    title: "Invalid score",
    message: "Choose a score from 0, 1, 2, or 3.",
  },
};

for (const sheet of [rubric, summary, scale]) {
  sheet.getRange("A1:H1").format = {
    fill: "#0F172A",
    font: { color: "#FFFFFF", bold: true },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
}

rubric.getRange(`A1:H${rows.length + 1}`).format = {
  borders: { preset: "all", style: "thin", color: "#CBD5E1" },
  verticalAlignment: "top",
  wrapText: true,
};
rubric.getRange(`A1:H1`).format.fill = "#0F172A";
rubric.getRange(`A1:H1`).format.font = { color: "#FFFFFF", bold: true };
rubric.getRange(`A2:A${rows.length + 1}`).format.horizontalAlignment = "center";
rubric.getRange(`C2:D${rows.length + 1}`).format.horizontalAlignment = "center";
rubric.getRange(`F2:G${rows.length + 1}`).format.horizontalAlignment = "center";
rubric.getRange(`G${totalRow}:G${totalRow + 2}`).format.numberFormat = "0.00";
rubric.getRange(`G${totalRow + 3}`).format.numberFormat = "0%";
rubric.getRange(`F${totalRow}:G${totalRow + 3}`).format = {
  fill: "#E0F2FE",
  font: { bold: true, color: "#0F172A" },
  borders: { preset: "all", style: "thin", color: "#7DD3FC" },
};
rubric.getRange(`E2:E${rows.length + 1}`).format.wrapText = true;
rubric.getRange(`H2:H${rows.length + 1}`).format.wrapText = true;
rubric.getRange(`F2:F${rows.length + 1}`).conditionalFormats.add('colorScale', {
  criteria: [
    { type: 'lowestValue', color: '#FCA5A5' },
    { type: 'percentile', value: 50, color: '#FDE68A' },
    { type: 'highestValue', color: '#BBF7D0' },
  ],
});

summary.getRange(`A1:F${sections.length + 1}`).format = {
  borders: { preset: "all", style: "thin", color: "#CBD5E1" },
  verticalAlignment: "top",
  wrapText: true,
};
summary.getRange("A1:F1").format.fill = "#0F172A";
summary.getRange("A1:F1").format.font = { color: "#FFFFFF", bold: true };
summary.getRange(`E2:E${sections.length + 1}`).format.numberFormat = "0%";
summary.getRange(`B${sections.length + 3}:B${sections.length + 5}`).format.numberFormat = "0.00";
summary.getRange(`B${sections.length + 6}`).format.numberFormat = "0%";
summary.getRange(`A${sections.length + 3}:B${sections.length + 6}`).format = {
  fill: "#E0F2FE",
  font: { bold: true },
  borders: { preset: "all", style: "thin", color: "#7DD3FC" },
};
summary.getRange(`E2:E${sections.length + 1}`).conditionalFormats.add('dataBar', {
  color: '#38BDF8',
  gradient: true,
});

scale.getRange("A1:C5").format = {
  borders: { preset: "all", style: "thin", color: "#CBD5E1" },
  verticalAlignment: "top",
  wrapText: true,
};
scale.getRange("A1:C1").format.fill = "#0F172A";
scale.getRange("A1:C1").format.font = { color: "#FFFFFF", bold: true };
scale.getRange("A7:B11").format = {
  borders: { preset: "all", style: "thin", color: "#CBD5E1" },
  verticalAlignment: "top",
  wrapText: true,
};
scale.getRange("A7:B7").format = {
  fill: "#E0F2FE",
  font: { bold: true },
};

rubric.getRange("A:A").format.columnWidthPx = 60;
rubric.getRange("B:B").format.columnWidthPx = 210;
rubric.getRange("C:D").format.columnWidthPx = 92;
rubric.getRange("E:E").format.columnWidthPx = 520;
rubric.getRange("F:G").format.columnWidthPx = 120;
rubric.getRange("H:H").format.columnWidthPx = 300;

summary.getRange("A:A").format.columnWidthPx = 240;
summary.getRange("B:E").format.columnWidthPx = 120;
summary.getRange("F:F").format.columnWidthPx = 360;

scale.getRange("A:A").format.columnWidthPx = 80;
scale.getRange("B:B").format.columnWidthPx = 260;
scale.getRange("C:C").format.columnWidthPx = 520;

rubric.freezePanes.freezeRows(1);
summary.freezePanes.freezeRows(1);
scale.freezePanes.freezeRows(1);

const rubricCheck = await workbook.inspect({
  kind: "table",
  range: "Rubric!A1:H12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 8,
});
console.log(rubricCheck.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

await workbook.render({ sheetName: "Rubric", range: "A1:H36", scale: 1 });
await workbook.render({ sheetName: "Section Summary", range: "A1:F36", scale: 1 });
await workbook.render({ sheetName: "Scoring Scale", range: "A1:C11", scale: 1 });

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
await fs.stat(outputPath);
console.log(`Saved ${outputPath}`);
