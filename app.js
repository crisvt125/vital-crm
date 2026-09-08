
// ── DEBUG ─────────────────────────────────────────────────────
function dbg(label, data, isErr) {
  const log = document.getElementById("debugLog");
  if (!log) return;
  const t = new Date().toLocaleTimeString("he-IL", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
  const entry = document.createElement("div");
  entry.className = "dbg-entry";
  let dataStr = "";
  try { dataStr = JSON.stringify(data, null, 2); } catch(e) { dataStr = String(data); }
  entry.innerHTML =
    `<span class="dbg-time">[${t}]</span> ` +
    `<span class="dbg-label ${isErr?"dbg-err":""}">${esc(label)}</span><br>` +
    `<span class="dbg-data">${esc(dataStr.substring(0, 1000))}${dataStr.length>1000?"…":""}</span>`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function toggleDebug() {
  document.getElementById("debugPanel").classList.toggle("open");
}

function isOnlineMeetingField(name) {
  name = (name || "").toLowerCase();
  return ["online", "meeting", "conferenc", "teams", "venue", "web_conf", "join", "remind"].some(function(k) {
    return name.indexOf(k) !== -1;
  });
}

function testOnlineMeetingFields() {
  dbg("TEST FIELDS → ZOHO.CRM.META.getFields Events", "...");
  ZOHO.CRM.META.getFields({ Entity: "Events" })
    .then(function(r) {
      const all = (r.fields || []).map(function(f) {
        return { api_name: f.api_name, label: f.field_label, data_type: f.data_type, pick_list_values: f.pick_list_values };
      });
      console.log("ALL Events fields", all);
      const relevant = all.filter(function(f) {
        return isOnlineMeetingField(f.api_name) || isOnlineMeetingField(f.label);
      }).map(function(f) {
        return {
          api_name: f.api_name,
          label: f.label,
          data_type: f.data_type,
          options: (f.pick_list_values || []).map(function(p) { return p.actual_value || p.display_value; })
        };
      });
      dbg("TEST FIELDS ✓ Events fields (filtered, see console for full list)", relevant);
    })
    .catch(function(e) { dbg("TEST FIELDS ✗ getFields", e, true); });

  if (!currentAccountId) return;
  dbg("TEST RAW → getRelatedRecords Events (raw record for inspection)", "...");
  ZOHO.CRM.API.getRelatedRecords({ Entity: "Accounts", RecordID: currentAccountId, RelatedList: "Events", page: 1, per_page: 5 })
    .then(function(r) {
      const records = r.data || [];
      console.log("ALL raw Events records", records);
      const relevant = records.map(function(rec) {
        const out = { id: rec.id, Event_Title: rec.Event_Title };
        Object.keys(rec).forEach(function(k) {
          if (isOnlineMeetingField(k)) out[k] = rec[k];
        });
        return out;
      });
      dbg("TEST RAW ✓ raw Events records (filtered, see console for full record)", relevant);
    })
    .catch(function(e) { dbg("TEST RAW ✗", e, true); });
}

// ── UTILS ─────────────────────────────────────────────────────
function esc(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
// Meeting summaries (pipeline-generated) may contain <strong>/<em> emphasis.
// Escape everything first (neutralizing any other tag), then re-allow only
// that exact pair — safer than a general HTML sanitizer for this one need.
function sanitizeSummaryHtml(s) {
  return esc(s).replace(/&lt;(\/?)(strong|em)&gt;/gi, "<$1$2>");
}
// Long_Summary is a single blob built by teams-pipeline's zoho_mapper.py:
// "<narrative>\n\n• highlight\n• highlight\n\n— חשיפות —\n• exposure line".
// Parsed back apart here rather than stored separately in Zoho — the format
// is entirely our own and deterministic, so this is safe to rely on.
function parseLongSummary(text) {
  const paras = (text || "").split(/\n\n+/);
  let narrative = "", highlightLines = [], exposureLines = [];
  paras.forEach(function(p) {
    const trimmed = p.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("— חשיפות —")) {
      exposureLines = trimmed.split("\n").slice(1).map(l => l.trim()).filter(Boolean);
    } else if (trimmed.split("\n").every(l => l.trim().startsWith("•"))) {
      highlightLines = trimmed.split("\n").map(l => l.trim()).filter(Boolean);
    } else if (!narrative) {
      narrative = trimmed;
    } else {
      narrative += "\n\n" + trimmed;
    }
  });
  return { narrative: narrative, highlightLines: highlightLines, exposureLines: exposureLines };
}
// Action items from Claude carry <strong>/<em> emphasis meant for the summary's
// rich text — Task Subject/Description are plain text, so strip tags entirely
// rather than let them show up as literal "<strong>" in Zoho.
function stripHtmlTags(s) {
  return String(s || "").replace(/<\/?[a-z][^>]*>/gi, "");
}
function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("he-IL", { day:"2-digit", month:"short", year:"numeric" });
}
function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("he-IL", { day:"2-digit", month:"short", year:"numeric" }) +
    " " + d.toLocaleTimeString("he-IL", { hour:"2-digit", minute:"2-digit" });
}
function isOverdue(iso) {
  return iso && new Date(iso) < new Date();
}
function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function showSpinner(id) {
  document.getElementById(id).innerHTML =
    '<div class="loading-state"><div class="spinner"></div><div>טוען...</div></div>';
}
function showError(msg) {
  const b = document.getElementById("errorBanner");
  b.textContent = "שגיאה: " + msg;
  b.style.display = "block";
}

function priorityHe(p) {
  if (!p) return "רגיל";
  const m = { "high":"גבוהה", "highest":"גבוהה מאוד", "medium":"רגיל", "normal":"רגיל", "low":"נמוכה", "lowest":"נמוכה מאוד" };
  return m[p.toLowerCase()] || p;
}

// ── STATE ─────────────────────────────────────────────────────
let allTasks = [], allNotes = [], allMeetings = [], allContacts = [];
let allMeetingSummaries = [], allHomeMeetingSummaries = [];
let taskFilter = "all", noteFilter = "all", meetingTimeFilter = "upcoming";
let currentAccountId = null, remarkTaskId = null, editingMeetingId = null, editingContactId = null;
let meetingParticipantEmails = [];
let assigningSummaryId = null;

function isOnlineMeeting(m) {
  return !!(m && (
    (m.$meeting_details && m.$meeting_details.joinmeeting_url) ||
    m.Meeting_Provider__s ||
    m.Meeting_Venue__s === "Online" ||
    m.Imported_Teams_Meeting_Id
  ));
}

// Extracts the core meeting-thread id (e.g. "19:meeting_XXXX@thread.v2") out of
// a Teams join URL, ignoring host/query-string/tracking-param differences —
// identical rule to teams-pipeline's zoho_client.normalize_teams_join_url(),
// so an imported meeting can be matched later regardless of how the link was
// copied. Keep the two in sync if either changes (see both READMEs).
function normalizeTeamsJoinUrl(url) {
  const m = /meetup-join\/([^/?]+)/i.exec(url || "");
  return m ? decodeURIComponent(m[1]) : (url || "").trim();
}

// Reconstructs a usable join link from the normalized id stored on an
// imported meeting, since $meeting_details.joinmeeting_url only exists for
// meetings Zoho itself provisioned.
function getJoinUrl(m) {
  if (m.$meeting_details && m.$meeting_details.joinmeeting_url) return m.$meeting_details.joinmeeting_url;
  if (m.Imported_Teams_Meeting_Id) return "https://teams.microsoft.com/l/meetup-join/" + encodeURIComponent(m.Imported_Teams_Meeting_Id);
  return "";
}

// ── FILTERS ───────────────────────────────────────────────────
document.getElementById("taskFilters").addEventListener("click", function(e) {
  const btn = e.target.closest(".filter-btn"); if (!btn) return;
  document.querySelectorAll("#taskFilters .filter-btn").forEach(b => b.className = "filter-btn");
  btn.classList.add("active-t");
  taskFilter = btn.dataset.f;
  renderTasks();
});
document.getElementById("noteFilters").addEventListener("click", function(e) {
  const btn = e.target.closest(".filter-btn"); if (!btn) return;
  document.querySelectorAll("#noteFilters .filter-btn").forEach(b => b.className = "filter-btn");
  btn.classList.add("active-n");
  noteFilter = btn.dataset.f;
  renderNotes();
});
document.getElementById("meetingTimeFilters").addEventListener("click", function(e) {
  const btn = e.target.closest(".filter-btn"); if (!btn) return;
  document.querySelectorAll("#meetingTimeFilters .filter-btn").forEach(b => b.className = "filter-btn");
  btn.classList.add("active-a");
  meetingTimeFilter = btn.dataset.tf;
  renderActivities();
});

// ── COLLAPSIBLE PANELS (mobile only — see styles.css) ──────────
// Runs once: the panel shells are static markup, only their inner lists
// get re-rendered per client, so wiring happens a single time at load.
function initCollapsiblePanels() {
  document.querySelectorAll(".panel[data-panel-id]").forEach(function(panel) {
    const key = "panel_collapsed_" + panel.dataset.panelId;
    const stored = localStorage.getItem(key);
    const collapsed = stored === null ? true : stored === "1";
    panel.classList.toggle("collapsed", collapsed);
    const head = panel.querySelector(".panel-head");
    if (!head) return;
    head.addEventListener("click", function(e) {
      // Let real header buttons (+ משימה, list/calendar toggle, etc.) do their own thing —
      // only bare-bar taps (or the arrow itself) should collapse/expand.
      if (e.target.closest("button:not(.panel-collapse-toggle)")) return;
      const nowCollapsed = !panel.classList.contains("collapsed");
      panel.classList.toggle("collapsed", nowCollapsed);
      localStorage.setItem(key, nowCollapsed ? "1" : "0");
    });
  });
}
initCollapsiblePanels();

// ── ZOHO INIT ─────────────────────────────────────────────────
ZOHO.embeddedApp.on("PageLoad", function() {
  document.getElementById("headerDate").textContent =
    new Date().toLocaleDateString("he-IL", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
  loadAccounts();
  loadHomeView();
});
ZOHO.embeddedApp.init();

// ── LOAD ACCOUNTS ─────────────────────────────────────────────
const CLIENT_STATUS_GROUPS = [
  { status: "לקוח פעיל",       label: "לקוחות פעילים" },
  { status: "לקוח פוטנציאלי",  label: "לקוחות פוטנציאליים" },
  { status: "לקוח לא פעיל",    label: "לקוחות לא פעילים" },
  { status: "",                label: "ללא סטטוס" }
];

function loadAccounts() {
  ZOHO.CRM.API.getAllRecords({
    Entity: "Accounts",
    sort_order: "asc",
    sort_by: "Account_Name",
    per_page: 100,
    page: 1
  }).then(function(resp) {
    const sel = document.getElementById("clientSelect");
    sel.innerHTML = '<option value="">— בחר לקוח —</option>';

    if (!resp.data || !resp.data.length) {
      sel.innerHTML = '<option value="">לא נמצאו חשבונות ב-CRM</option>';
      return;
    }

    // Grouped by status (active → potential → inactive → none), alphabetical
    // within each group since the API already returned accounts sorted by name.
    CLIENT_STATUS_GROUPS.forEach(function(group) {
      const accounts = resp.data.filter(function(a) { return (a.field6 || "") === group.status; });
      if (!accounts.length) return;
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.label;
      accounts.forEach(function(account) {
        const opt = document.createElement("option");
        opt.value        = account.id;
        opt.textContent  = account.Account_Name;
        opt.dataset.phone    = account.Phone    || "";
        opt.dataset.industry = account.Industry || "";
        opt.dataset.owner    = account.Owner ? account.Owner.name : "";
        opt.dataset.status   = account.field6  || "";
        optgroup.appendChild(opt);
      });
      sel.appendChild(optgroup);
    });

    sel.addEventListener("change", function() {
      const opt = sel.options[sel.selectedIndex];
      if (!opt.value) { showHomeView(); return; }
      loadClientData(opt.value, {
        name:     opt.textContent,
        phone:    opt.dataset.phone,
        industry: opt.dataset.industry,
        owner:    opt.dataset.owner,
        status:   opt.dataset.status
      });
    });

    const lastId = sessionStorage.getItem("crm_lastAccountId");
    const hasLastId = lastId && Array.prototype.some.call(sel.options, function(o) { return o.value === lastId; });
    if (hasLastId) {
      sel.value = lastId;
      sel.dispatchEvent(new Event("change"));
    }

  }).catch(function(err) {
    showError("לא ניתן לטעון חשבונות — " + JSON.stringify(err));
  });
}

// ── HOME NAVIGATION ───────────────────────────────────────────
function showHomeView() {
  document.getElementById("homeView").classList.remove("hidden");
  document.getElementById("mainPanels").classList.add("hidden");
  document.getElementById("summariesView").classList.add("hidden");
  document.getElementById("summariesToggleBtn").classList.remove("active");
  document.getElementById("contactsBar").classList.add("hidden");
  document.getElementById("clientSelect").value = "";
  currentAccountId = null;
  sessionStorage.removeItem("crm_lastAccountId");
  setClientStatusSelect("");
  document.getElementById("clientStatusSelect").disabled = true;
  ["statTasks","statNotes","statActions","statSummaries"].forEach(function(s) {
    document.getElementById(s).textContent = "—";
  });
  document.getElementById("clientName").textContent = "בחר לקוח";
  document.getElementById("clientMeta").textContent = "בחר לקוח מהרשימה הנפתחת למעלה";
}

// ── CLIENT STATUS ─────────────────────────────────────────────
const CLIENT_STATUS_CLASS = {
  "לקוח פעיל": "status-active",
  "לקוח פוטנציאלי": "status-potential",
  "לקוח לא פעיל": "status-inactive"
};

function setClientStatusSelect(status) {
  const sel = document.getElementById("clientStatusSelect");
  sel.value = status || "";
  Object.values(CLIENT_STATUS_CLASS).forEach(c => sel.classList.remove(c));
  if (CLIENT_STATUS_CLASS[status]) sel.classList.add(CLIENT_STATUS_CLASS[status]);
}

// Moves a client <option> into the optgroup matching its (possibly just-changed)
// status, creating the group if needed — otherwise the client picker keeps
// showing it under its old status group until the page is reloaded.
function regroupClientOption(opt, status) {
  const sel = document.getElementById("clientSelect");
  const group = CLIENT_STATUS_GROUPS.find(function(g) { return g.status === (status || ""); });
  const groupIndex = CLIENT_STATUS_GROUPS.indexOf(group);

  let optgroup = Array.prototype.find.call(sel.querySelectorAll("optgroup"), function(og) { return og.label === group.label; });
  if (!optgroup) {
    optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    const laterGroup = CLIENT_STATUS_GROUPS.slice(groupIndex + 1)
      .map(function(g) { return Array.prototype.find.call(sel.querySelectorAll("optgroup"), function(og) { return og.label === g.label; }); })
      .find(Boolean);
    sel.insertBefore(optgroup, laterGroup || null);
  }
  optgroup.appendChild(opt);

  Array.prototype.slice.call(sel.querySelectorAll("optgroup")).forEach(function(og) {
    if (!og.children.length) og.remove();
  });
}

document.getElementById("clientStatusSelect").addEventListener("change", function() {
  if (!currentAccountId) return;
  const newStatus = this.value;
  const sel = document.getElementById("clientSelect");
  const opt = sel.options[sel.selectedIndex];
  const prevStatus = opt ? opt.dataset.status : "";
  this.disabled = true;

  ZOHO.CRM.API.updateRecord({
    Entity: "Accounts",
    APIData: { id: currentAccountId, field6: newStatus },
    Trigger: []
  }).then(function() {
    if (opt) {
      opt.dataset.status = newStatus;
      regroupClientOption(opt, newStatus);
    }
    setClientStatusSelect(newStatus);
  }).catch(function(err) {
    setClientStatusSelect(prevStatus);
    showError("לא ניתן לעדכן סטטוס לקוח — " + JSON.stringify(err));
  }).finally(function() {
    document.getElementById("clientStatusSelect").disabled = false;
  });
});

document.addEventListener("keydown", function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    document.getElementById("clientSelect").focus();
  }
});

// ── CLIENT MODAL ──────────────────────────────────────────────
function openClientModal() {
  document.getElementById("clientNameInput").value = "";
  document.getElementById("clientPhoneInput").value = "";
  document.getElementById("clientWebsiteInput").value = "";
  document.getElementById("clientAccountNumberInput").value = "";
  document.getElementById("clientReferrerInput").value = "";
  document.getElementById("clientReferrerFeeInput").value = "";
  document.getElementById("clientFeeAmountInput").value = "";
  document.getElementById("clientPremiumMethodSelect").value = "";
  const saveBtn = document.getElementById("saveClientBtn");
  saveBtn.disabled = false;
  saveBtn.textContent = "שמור";
  document.getElementById("clientModal").classList.add("open");
  setTimeout(function() { document.getElementById("clientNameInput").focus(); }, 50);
}

function closeClientModal() {
  document.getElementById("clientModal").classList.remove("open");
}

function saveClient() {
  const name           = document.getElementById("clientNameInput").value.trim();
  const phone          = document.getElementById("clientPhoneInput").value.trim();
  const website        = document.getElementById("clientWebsiteInput").value.trim();
  const accountNumber  = document.getElementById("clientAccountNumberInput").value.trim();
  const referrer       = document.getElementById("clientReferrerInput").value.trim();
  const referrerFee    = document.getElementById("clientReferrerFeeInput").value.trim();
  const feeAmount      = document.getElementById("clientFeeAmountInput").value.trim();
  const premiumMethod  = document.getElementById("clientPremiumMethodSelect").value;
  if (!name) { document.getElementById("clientNameInput").focus(); return; }

  const saveBtn = document.getElementById("saveClientBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "שומר...";

  const apiData = { Account_Name: name };
  if (phone)          apiData.Phone = phone;
  if (website)        apiData.Website = website;
  if (accountNumber)  apiData.Account_Number = accountNumber;
  if (referrer)        apiData.field2 = referrer;
  if (referrerFee)     apiData.field4 = referrerFee;
  if (feeAmount)       apiData.field5 = feeAmount;
  if (premiumMethod)  apiData.field1 = [premiumMethod];

  ZOHO.CRM.API.insertRecord({ Entity: "Accounts", APIData: apiData }).then(function(resp) {
    const newId = resp.data[0].details.id;
    const sel = document.getElementById("clientSelect");
    const opt = document.createElement("option");
    opt.value = newId;
    opt.textContent = name;
    opt.dataset.phone = phone;
    opt.dataset.industry = "";
    opt.dataset.owner = "";
    sel.appendChild(opt);
    sel.value = newId;
    closeClientModal();
    loadClientData(newId, { name: name, phone: phone, industry: "", owner: "" });
  }).catch(function(err) {
    saveBtn.disabled = false;
    saveBtn.textContent = "שמור";
    showError("לא ניתן ליצור לקוח — " + JSON.stringify(err));
  });
}

document.getElementById("clientModal").addEventListener("click", function(e) {
  if (e.target === this) closeClientModal();
});

// ── LOAD CLIENT DATA ──────────────────────────────────────────
function loadClientData(id, meta) {
  document.getElementById("homeView").classList.add("hidden");
  document.getElementById("summariesView").classList.add("hidden");
  document.getElementById("mainPanels").classList.remove("hidden");
  document.getElementById("contactsBar").classList.remove("hidden");
  document.getElementById("summariesToggleBtn").classList.remove("active");

  currentAccountId = id;
  sessionStorage.setItem("crm_lastAccountId", id);
  document.getElementById("clientName").textContent = meta.name;
  document.getElementById("clientMeta").textContent =
    [meta.owner    ? "אחראי: " + meta.owner    : "",
     meta.industry || "",
     meta.phone    || ""].filter(Boolean).join("  ·  ");
  setClientStatusSelect(meta.status || "");
  document.getElementById("clientStatusSelect").disabled = false;

  ["statTasks","statNotes","statActions","statSummaries"].forEach(function(s) {
    document.getElementById(s).textContent = "…";
  });

  allMeetings = [];
  showSpinner("taskList");
  showSpinner("noteList");
  showSpinner("actionList");
  document.getElementById("summarySelect").innerHTML = '<option value="">— בחר פגישה —</option>';
  document.getElementById("summaryContent").classList.add("hidden");
  document.getElementById("summaryEmptyState").classList.add("hidden");

  Promise.all([
    ZOHO.CRM.API.getRelatedRecords({ Entity:"Accounts", RecordID:id, RelatedList:"Tasks", page:1, per_page:50 }),
    ZOHO.CRM.API.getRelatedRecords({ Entity:"Accounts", RecordID:id, RelatedList:"Notes", page:1, per_page:50 })
  ]).then(function(results) {
    allTasks = results[0].data || [];
    allNotes = results[1].data || [];
    dbg("loadClientData ✓", { tasks: allTasks.length, notes: allNotes.length });

    taskFilter = noteFilter = "all";
    meetingTimeFilter = "upcoming";
    document.querySelectorAll("#taskFilters .filter-btn").forEach(b => b.className = "filter-btn");
    document.querySelectorAll("#noteFilters .filter-btn").forEach(b => b.className = "filter-btn");
    document.querySelectorAll("#meetingTimeFilters .filter-btn").forEach(b => b.className = "filter-btn");
    document.querySelector("#taskFilters [data-f='all']").classList.add("active-t");
    document.querySelector("#noteFilters [data-f='all']").classList.add("active-n");
    document.querySelector("#meetingTimeFilters [data-tf='upcoming']").classList.add("active-a");

    renderTasks();
    renderNotes();
    renderActivities();

  }).catch(function(err) {
    showError("שגיאה בטעינת נתוני לקוח — " + JSON.stringify(err));
  });

  loadMeetings(id);
  loadContacts(id);
  loadMeetingSummaries(id);
}

// ── MEETING SUMMARIES ─────────────────────────────────────────
function loadMeetingSummaries(accountId) {
  ZOHO.CRM.API.getRelatedRecords({
    Entity: "Accounts", RecordID: accountId,
    RelatedList: "Meeting_Summaries", page: 1, per_page: 50
  }).then(function(resp) {
    allMeetingSummaries = resp.data || [];
    renderMeetingSummaries();
  }).catch(function(err) {
    allMeetingSummaries = [];
    renderMeetingSummaries();
    showError("לא ניתן לטעון תקצירי פגישות — " + JSON.stringify(err));
  });
}

function renderMeetingSummaries() {
  const items = [...allMeetingSummaries].sort((a, b) => new Date(b.Meeting_Date || 0) - new Date(a.Meeting_Date || 0));
  document.getElementById("statSummaries").textContent = allMeetingSummaries.length;

  const sel = document.getElementById("summarySelect");
  const prevValue = sel.value;

  if (!items.length) {
    sel.innerHTML = '<option value="">— בחר פגישה —</option>';
    sel.disabled = true;
    document.getElementById("summaryEmptyState").classList.remove("hidden");
    document.getElementById("summaryContent").classList.add("hidden");
    return;
  }

  sel.disabled = false;
  sel.innerHTML = items.map(function(s) {
    const label = esc(s.Name || "פגישה") + (s.Meeting_Date ? " — " + fmtDate(s.Meeting_Date) : "");
    return `<option value="${esc(s.id)}">${label}</option>`;
  }).join("");

  sel.value = items.some(s => s.id === prevValue) ? prevValue : items[0].id;
  renderSelectedSummaryContent();
}

function renderSelectedSummaryContent() {
  const id = document.getElementById("summarySelect").value;
  const s = allMeetingSummaries.find(function(x) { return x.id === id; });
  document.getElementById("summaryEmptyState").classList.add("hidden");
  document.getElementById("summaryContent").classList.toggle("hidden", !s);
  if (!s) return;

  const parsed = parseLongSummary(s.Long_Summary || "");

  const bulletsHtml = function(lines) {
    return lines.length
      ? lines.map(l => `<div class="summary-bullet">${sanitizeSummaryHtml(l)}</div>`).join("")
      : '<div class="summary-bullet-empty">—</div>';
  };
  document.getElementById("summaryExposuresList").innerHTML = bulletsHtml(parsed.exposureLines);
  document.getElementById("summaryHighlightsList").innerHTML = bulletsHtml(parsed.highlightLines);
  document.getElementById("summaryLongText").innerHTML = sanitizeSummaryHtml(parsed.narrative);
}

document.getElementById("summarySelect").addEventListener("change", renderSelectedSummaryContent);

function toggleSummariesView() {
  if (!currentAccountId) { showError("יש לבחור לקוח תחילה"); return; }
  const showingSummaries = !document.getElementById("summariesView").classList.contains("hidden");
  document.getElementById("summariesView").classList.toggle("hidden", showingSummaries);
  document.getElementById("mainPanels").classList.toggle("hidden", !showingSummaries);
  document.getElementById("summariesToggleBtn").classList.toggle("active", !showingSummaries);
}

// ── CONTACTS ──────────────────────────────────────────────────
function loadContacts(accountId) {
  document.getElementById("contactsChips").innerHTML = "";
  ZOHO.CRM.API.getRelatedRecords({ Entity: "Accounts", RecordID: accountId, RelatedList: "Contacts", page: 1, per_page: 50 })
    .then(function(resp) {
      allContacts = resp.data || [];
      renderContacts();
    })
    .catch(function(err) { showError("לא ניתן לטעון אנשי קשר — " + JSON.stringify(err)); });
}

function renderContacts() {
  const chips = document.getElementById("contactsChips");
  if (!allContacts.length) {
    chips.innerHTML = '<span style="font-size:11.5px;color:var(--gray-300)">אין אנשי קשר</span>';
    return;
  }
  chips.innerHTML = allContacts.map(function(c) {
    const name  = [c.First_Name, c.Last_Name].filter(Boolean).join(" ") || "ללא שם";
    const phone = c.Mobile || "";
    return '<span class="contact-chip" data-contact-id="' + esc(c.id) + '" style="cursor:pointer">' + esc(name) +
      (phone ? '<span class="contact-phone">' + esc(phone) + '</span>' : "") +
      '</span>';
  }).join("");
}

document.getElementById("contactsChips").addEventListener("click", function(e) {
  const chip = e.target.closest(".contact-chip");
  if (chip && chip.dataset.contactId) openContactModal(chip.dataset.contactId);
});

function openContactModal(contactId) {
  if (!currentAccountId) { showError("יש לבחור לקוח תחילה"); return; }
  editingContactId = contactId || null;
  const contact = contactId ? allContacts.find(function(c) { return c.id === contactId; }) : null;
  document.getElementById("contactModalTitle").textContent = contact ? "עריכת איש קשר" : "איש קשר חדש";
  document.getElementById("contactFirstNameInput").value = contact ? (contact.First_Name || "") : "";
  document.getElementById("contactLastNameInput").value = contact ? (contact.Last_Name || "") : "";
  document.getElementById("contactPhoneInput").value = contact ? (contact.Mobile || "") : "";
  document.getElementById("contactEmailInput").value = contact ? (contact.Email || "") : "";
  const saveBtn = document.getElementById("saveContactBtn");
  saveBtn.disabled = false;
  saveBtn.textContent = "שמור";
  document.getElementById("contactModal").classList.add("open");
  setTimeout(function() { document.getElementById("contactFirstNameInput").focus(); }, 50);
}

function closeContactModal() {
  document.getElementById("contactModal").classList.remove("open");
  editingContactId = null;
}

function saveContact() {
  const firstName = document.getElementById("contactFirstNameInput").value.trim();
  const lastName  = document.getElementById("contactLastNameInput").value.trim();
  const phone     = document.getElementById("contactPhoneInput").value.trim();
  const email     = document.getElementById("contactEmailInput").value.trim();
  if (!lastName) { document.getElementById("contactLastNameInput").focus(); return; }

  const saveBtn = document.getElementById("saveContactBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "שומר...";

  const apiData = { Last_Name: lastName };
  if (firstName) apiData.First_Name = firstName;
  if (phone)     apiData.Mobile = phone;
  if (email)     apiData.Email = email;

  let apiCall;
  if (editingContactId) {
    apiData.id = editingContactId;
    apiCall = ZOHO.CRM.API.updateRecord({ Entity: "Contacts", APIData: apiData, Trigger: [] });
  } else {
    apiData.Account_Name = currentAccountId;
    apiCall = ZOHO.CRM.API.insertRecord({ Entity: "Contacts", APIData: apiData });
  }

  apiCall.then(function() {
    closeContactModal();
    loadContacts(currentAccountId);
  }).catch(function(err) {
    saveBtn.disabled = false;
    saveBtn.textContent = "שמור";
    showError("לא ניתן לשמור איש קשר — " + JSON.stringify(err));
  });
}

document.getElementById("contactModal").addEventListener("click", function(e) {
  if (e.target === this) closeContactModal();
});

// ── RENDER TASKS ──────────────────────────────────────────────
function renderTasks() {
  const isArchive = taskFilter === "archive";
  const openCount = allTasks.filter(t => t.Status !== "Completed").length;
  document.getElementById("statTasks").textContent = openCount;
  document.getElementById("taskPanelTitle").textContent = isArchive ? "ארכיון משימות" : "משימות פתוחות";

  let items = allTasks.filter(t => isArchive ? t.Status === "Completed" : t.Status !== "Completed");
  if (taskFilter === "high")    items = items.filter(t => (t.Priority||"").toLowerCase() === "high");
  if (taskFilter === "overdue") items = items.filter(t => isOverdue(t.Due_Date));
  if (isArchive) items.sort((a,b) => new Date(b.Modified_Time||0) - new Date(a.Modified_Time||0));

  document.getElementById("taskCount").textContent = isArchive
    ? allTasks.filter(t => t.Status === "Completed").length
    : openCount;

  const list = document.getElementById("taskList");
  if (!items.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">' + (isArchive?"🗂":"✅") + '</div><div>אין משימות התואמות לסינון</div></div>';
    return;
  }

  list.innerHTML = items.map(function(t) {
    const due = t.Due_Date || "";
    const ov  = isOverdue(due);
    const p   = (t.Priority || "normal").toLowerCase();
    const bc  = p === "high" ? "badge-high" : p === "low" ? "badge-low" : "badge-med";
    return `
      <div class="task-card${isArchive?" task-archived":""}">
        <div class="task-title">${esc(t.Subject || "משימה ללא שם")}</div>
        <div class="task-meta">
          ${isArchive
            ? '<span class="done-check">✓</span>'
            : `<button class="done-btn" data-task-id="${esc(t.id)}" title="סמן כהושלם">✓</button>`}
          ${isArchive
            ? '<span class="badge badge-closed">הושלם</span>'
            : `<span class="badge ${bc}">${priorityHe(t.Priority)}</span>`}
          ${due ? `<span class="due-date ${ov&&!isArchive?"overdue":""}">${fmtDate(due)}</span>` : ""}
          ${t.Owner ? `<span style="font-size:11px;color:var(--gray-500);white-space:nowrap;flex-shrink:0">${esc(t.Owner.name)}</span>` : ""}
          ${t.id ? `<a class="crm-link" href="https://crm.zoho.com/crm/org919146768/tab/Tasks/${t.id}" target="_blank">פתח ↗</a>` : ""}
          <button class="edit-meeting-btn edit-task-btn" data-edit-task-id="${esc(t.id)}">ערוך</button>
          ${isArchive
            ? `<button class="remark-btn" data-reopen-id="${esc(t.id)}" style="color:var(--blue)">↩ פתח מחדש</button>`
            : `<button class="remark-btn" data-task-id="${esc(t.id)}" data-task-subject="${esc(t.Subject||'')}">+ הערה</button>`}
        </div>
      </div>`;
  }).join("");
}

// ── RENDER NOTES ──────────────────────────────────────────────
function renderNotes() {
  let items = [...allNotes];
  if (noteFilter === "recent") {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    items = items.filter(n => n.Created_Time && new Date(n.Created_Time) >= cutoff);
  }
  items.sort((a,b) => new Date(b.Created_Time||0) - new Date(a.Created_Time||0));

  document.getElementById("noteCount").textContent = allNotes.length;
  document.getElementById("statNotes").textContent = allNotes.length;

  const list = document.getElementById("noteList");
  if (!items.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><div>אין הערות התואמות לסינון</div></div>';
    return;
  }

  list.innerHTML = items.map(function(n) {
    const body    = (n.Note_Content || "").trim();
    const preview = body.length > 220 ? body.substring(0,220) + "…" : body;
    return `
      <div class="note-card">
        <div class="note-header">
          <div class="note-subject">${esc(n.Note_Title || "הערה")}</div>
          ${n.Created_By ? `<span class="note-tag">${esc(n.Created_By.name)}</span>` : ""}
          <div class="note-date">${fmtDate(n.Created_Time)}</div>
        </div>
        <div class="note-body">${esc(preview)}</div>
      </div>`;
  }).join("");
}

// ── RENDER ACTIVITIES ─────────────────────────────────────────
function renderActivities() {
  const now = new Date();
  let items = [...allMeetings];
  if (meetingTimeFilter === "upcoming") items = items.filter(a => new Date(a.Start_DateTime || 0) >= now);
  if (meetingTimeFilter === "past")     items = items.filter(a => new Date(a.Start_DateTime || 0) < now);
  items.sort(function(a, b) {
    const da = new Date(a.Start_DateTime || 0);
    const db = new Date(b.Start_DateTime || 0);
    const af = da >= now, bf = db >= now;
    if (af && !bf) return -1;
    if (!af && bf) return 1;
    return af ? da - db : db - da;
  });

  document.getElementById("actionCount").textContent = items.length;
  document.getElementById("statActions").textContent = allMeetings.length;

  const list = document.getElementById("actionList");
  if (!items.length) {
    const msg = meetingTimeFilter === "upcoming" ? "אין פגישות עתידיות"
              : meetingTimeFilter === "past"     ? "אין פגישות קודמות"
              : "אין פגישות";
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><div>${msg}</div></div>`;
    return;
  }

  list.innerHTML = items.map(function(a) {
    const done      = a.Status === "Completed";
    const desc      = (a.Description || "").trim();
    const meetDate  = a.Start_DateTime || "";
    const upcoming  = meetDate && new Date(meetDate) >= now;
    const joinUrl   = getJoinUrl(a);
    return `
      <div class="action-card ${done?"done-action":""}">
        <div class="action-header">
          <div class="action-title">${esc(a.Event_Title || a.Subject || "פגישה")}</div>
          ${meetDate ? `<span class="meeting-date ${upcoming?"upcoming":""}">📅 ${fmtDateTime(meetDate)}</span>` : ""}
          ${isToday(meetDate) ? `<span class="badge badge-today">היום</span>` : ""}
          <span class="badge ${upcoming?"badge-upcoming":"badge-past"}">${upcoming?"עתידי":"עבר"}</span>
        </div>
        ${desc ? `<div class="action-body">${esc(desc.substring(0,140))}${desc.length>140?"…":""}</div>` : ""}
        <div class="action-footer">
          ${a.Owner ? `<div class="owner-chip"><div class="avatar">${esc(a.Owner.name.charAt(0))}</div>${esc(a.Owner.name)}</div>` : ""}
          <button class="edit-meeting-btn" data-meeting-id="${esc(a.id)}">ערוך</button>
          <button class="edit-meeting-btn delete-meeting-btn" data-meeting-id="${esc(a.id)}">🗑 בטל פגישה</button>
          ${joinUrl ? `<a class="crm-link" href="${esc(joinUrl)}" target="_blank">🟦 הצטרף ל-Teams ↗</a>` : ""}
          ${a.id ? `<a class="crm-link" href="https://crm.zoho.com/crm/org919146768/tab/Events/${a.id}" target="_blank">פתח ↗</a>` : ""}
        </div>
      </div>`;
  }).join("");
}

// ── TASK ACTIONS ──────────────────────────────────────────────
document.getElementById("taskList").addEventListener("click", function(e) {
  const doneBtn = e.target.closest(".done-btn");
  if (doneBtn && doneBtn.dataset.taskId) { markTaskDone(doneBtn.dataset.taskId); return; }
  const reopenBtn = e.target.closest("[data-reopen-id]");
  if (reopenBtn && reopenBtn.dataset.reopenId) { reopenTask(reopenBtn.dataset.reopenId); return; }
  const remarkBtn = e.target.closest(".remark-btn");
  if (remarkBtn && remarkBtn.dataset.taskId) {
    openRemarkModal(remarkBtn.dataset.taskId, remarkBtn.dataset.taskSubject || "");
    return;
  }
  const editTaskBtn = e.target.closest(".edit-task-btn");
  if (editTaskBtn && editTaskBtn.dataset.editTaskId) {
    openTaskModal(editTaskBtn.dataset.editTaskId);
  }
});

function markTaskDone(taskId) {
  ZOHO.CRM.API.updateRecord({
    Entity: "Tasks",
    APIData: { id: taskId, Status: "Completed" },
    Trigger: []
  }).then(function() {
    const task = allTasks.find(function(t) { return t.id === taskId; });
    if (task) task.Status = "Completed";
    renderTasks();
  }).catch(function(err) {
    showError("לא ניתן לעדכן משימה — " + JSON.stringify(err));
  });
}

function reopenTask(taskId) {
  ZOHO.CRM.API.updateRecord({
    Entity: "Tasks",
    APIData: { id: taskId, Status: "Not Started" },
    Trigger: []
  }).then(function() {
    const task = allTasks.find(function(t) { return t.id === taskId; });
    if (task) task.Status = "Not Started";
    renderTasks();
  }).catch(function(err) {
    showError("לא ניתן לפתוח מחדש את המשימה — " + JSON.stringify(err));
  });
}

// ── REMARK MODAL ──────────────────────────────────────────────
function openRemarkModal(taskId, taskSubject) {
  remarkTaskId = taskId;
  document.getElementById("remarkModalSubject").textContent = taskSubject || "משימה";
  document.getElementById("remarkText").value = "";
  const saveBtn = document.getElementById("saveRemarkBtn");
  saveBtn.disabled = false;
  saveBtn.textContent = "שמור";
  document.getElementById("remarkModal").classList.add("open");
  setTimeout(function() { document.getElementById("remarkText").focus(); }, 50);
}

function closeRemarkModal() {
  document.getElementById("remarkModal").classList.remove("open");
  remarkTaskId = null;
}

function saveRemark() {
  const text = document.getElementById("remarkText").value.trim();
  if (!text || !remarkTaskId) return;
  const saveBtn = document.getElementById("saveRemarkBtn");
  const subject = document.getElementById("remarkModalSubject").textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = "שומר...";

  ZOHO.CRM.API.insertRecord({
    Entity: "Notes",
    APIData: {
      Note_Title: "הערה: " + subject,
      Note_Content: text,
      Parent_Id: remarkTaskId,
      $se_module: "Tasks"
    }
  }).then(function() {
    closeRemarkModal();
    reloadNotes();
  }).catch(function(err) {
    saveBtn.disabled = false;
    saveBtn.textContent = "שמור";
    showError("לא ניתן לשמור הערה — " + JSON.stringify(err));
  });
}

document.getElementById("remarkModal").addEventListener("click", function(e) {
  if (e.target === this) closeRemarkModal();
});

function reloadNotes() {
  if (!currentAccountId) return;
  ZOHO.CRM.API.getRelatedRecords({
    Entity: "Accounts", RecordID: currentAccountId,
    RelatedList: "Notes", page: 1, per_page: 50
  }).then(function(resp) {
    allNotes = resp.data || [];
    renderNotes();
  }).catch(function(err) { showError("לא ניתן לרענן הערות — " + JSON.stringify(err)); });
}

// ── NOTE MODAL ────────────────────────────────────────────────
function openNoteModal() {
  if (!currentAccountId) { showError("יש לבחור לקוח תחילה"); return; }
  document.getElementById("noteTitleInput").value = "";
  document.getElementById("noteContentInput").value = "";
  const saveBtn = document.getElementById("saveNoteBtn");
  saveBtn.disabled = false;
  saveBtn.textContent = "שמור";
  document.getElementById("noteModal").classList.add("open");
  setTimeout(function() { document.getElementById("noteTitleInput").focus(); }, 50);
}

function closeNoteModal() {
  document.getElementById("noteModal").classList.remove("open");
}

function saveNote() {
  const title   = document.getElementById("noteTitleInput").value.trim();
  const content = document.getElementById("noteContentInput").value.trim();
  if (!content) { document.getElementById("noteContentInput").focus(); return; }

  const saveBtn = document.getElementById("saveNoteBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "שומר...";

  ZOHO.CRM.API.insertRecord({
    Entity: "Notes",
    APIData: {
      Note_Title: title || "הערה",
      Note_Content: content,
      Parent_Id: currentAccountId,
      $se_module: "Accounts"
    }
  }).then(function() {
    closeNoteModal();
    reloadNotes();
  }).catch(function(err) {
    saveBtn.disabled = false;
    saveBtn.textContent = "שמור";
    showError("לא ניתן לשמור הערה — " + JSON.stringify(err));
  });
}

document.getElementById("noteModal").addEventListener("click", function(e) {
  if (e.target === this) closeNoteModal();
});

// ── MEETING MODAL ─────────────────────────────────────────────
let fpStart = null, fpEnd = null, fpTaskDue = null, fpImportStart = null, fpImportEnd = null;

const heLocale = {
  weekdays: {
    shorthand: ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"],
    longhand:  ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"]
  },
  months: {
    shorthand: ["ינו׳","פבר׳","מרץ","אפר׳","מאי","יוני","יולי","אוג׳","ספט׳","אוק׳","נוב׳","דצמ׳"],
    longhand:  ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"]
  },
  firstDayOfWeek: 0
};

const DURATION_PRESETS_MIN = [15, 30, 45, 60, 90, 120, 180, 240];

function applyDurationToEnd() {
  const durSel = document.getElementById("meetingDuration");
  if (durSel.value === "custom") return;
  const startDate = fpStart.selectedDates[0];
  if (!startDate) return;
  const end = new Date(startDate.getTime() + Number(durSel.value) * 60000);
  fpEnd.setDate(end, false);
}

function syncDurationFromDates() {
  const durSel = document.getElementById("meetingDuration");
  const customOpt = document.getElementById("meetingDurationCustomOpt");
  const startDate = fpStart.selectedDates[0];
  const endDate = fpEnd.selectedDates[0];
  if (!startDate || !endDate) { customOpt.hidden = true; return; }
  const diffMin = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
  if (DURATION_PRESETS_MIN.indexOf(diffMin) !== -1) {
    customOpt.hidden = true;
    durSel.value = String(diffMin);
  } else {
    customOpt.hidden = false;
    durSel.value = "custom";
  }
}

function initFlatpickr() {
  if (fpStart) return;
  const cfg = { enableTime: true, time_24hr: true, dateFormat: "Y-m-d H:i",
                locale: heLocale, disableMobile: true, appendTo: document.body };
  fpStart = flatpickr("#meetingStart", Object.assign({}, cfg, {
    onChange: function(dates) {
      if (dates[0]) applyDurationToEnd();
    }
  }));
  fpEnd = flatpickr("#meetingEnd", Object.assign({}, cfg, {
    onChange: function() { syncDurationFromDates(); }
  }));
  document.getElementById("meetingDuration").addEventListener("change", applyDurationToEnd);
}

function initTaskFlatpickr() {
  if (fpTaskDue) return;
  fpTaskDue = flatpickr("#taskDueDate", { dateFormat: "Y-m-d", locale: heLocale, disableMobile: true, appendTo: document.body });
}

function initImportMeetingFlatpickr() {
  if (fpImportStart) return;
  const cfg = { enableTime: true, time_24hr: true, dateFormat: "Y-m-d H:i",
                locale: heLocale, disableMobile: true, appendTo: document.body };
  fpImportStart = flatpickr("#importMeetingStart", cfg);
  fpImportEnd = flatpickr("#importMeetingEnd", cfg);
}

// ── IMPORT MEETING MODAL ──────────────────────────────────────
function openImportMeetingModal() {
  if (!currentAccountId) { showError("יש לבחור לקוח תחילה"); return; }
  initImportMeetingFlatpickr();
  document.getElementById("importMeetingSubject").value = "";
  document.getElementById("importMeetingJoinUrl").value = "";
  fpImportStart.clear();
  fpImportEnd.clear();
  const saveBtn = document.getElementById("saveImportMeetingBtn");
  saveBtn.disabled = false;
  saveBtn.textContent = "ייבוא";
  document.getElementById("importMeetingModal").classList.add("open");
  setTimeout(function() { document.getElementById("importMeetingSubject").focus(); }, 50);
}

function closeImportMeetingModal() {
  document.getElementById("importMeetingModal").classList.remove("open");
}

function saveImportMeeting() {
  const subject = document.getElementById("importMeetingSubject").value.trim();
  const start   = document.getElementById("importMeetingStart").value;
  const end     = document.getElementById("importMeetingEnd").value;
  const joinUrlRaw = document.getElementById("importMeetingJoinUrl").value.trim();
  if (!subject) { document.getElementById("importMeetingSubject").focus(); return; }
  if (!start)   { document.getElementById("importMeetingStart").focus(); return; }
  if (!joinUrlRaw) { document.getElementById("importMeetingJoinUrl").focus(); return; }

  const saveBtn = document.getElementById("saveImportMeetingBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "מייבא...";

  const apiData = {
    Event_Title: subject,
    Start_DateTime: toZohoDT(start),
    End_DateTime: toZohoDT(end || start),
    Imported_Teams_Meeting_Id: normalizeTeamsJoinUrl(joinUrlRaw),
    What_Id: currentAccountId,
    $se_module: "Accounts"
  };

  ZOHO.CRM.API.insertRecord({ Entity: "Events", APIData: apiData }).then(function() {
    closeImportMeetingModal();
    reloadActivities();
  }).catch(function(err) {
    saveBtn.disabled = false;
    saveBtn.textContent = "ייבוא";
    showError("לא ניתן לייבא פגישה — " + JSON.stringify(err));
  });
}

document.getElementById("importMeetingModal").addEventListener("click", function(e) {
  if (e.target === this) closeImportMeetingModal();
});

function toZohoDT(dtStr) {
  if (!dtStr) return "";
  const d = new Date(dtStr.replace(" ", "T"));
  if (isNaN(d)) return "";
  const p = n => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00${sign}${p(Math.floor(abs/60))}:${p(abs%60)}`;
}

const MS_PER_UNIT = { mins: 60000, hrs: 3600000, days: 86400000, weeks: 604800000 };

function buildReminderAt(startDtStr, unit, period) {
  const start = new Date(startDtStr.replace(" ", "T"));
  if (isNaN(start)) return "";
  const triggerDate = new Date(start.getTime() - unit * MS_PER_UNIT[period]);
  const p = n => String(n).padStart(2, "0");
  const off = -triggerDate.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${triggerDate.getFullYear()}-${p(triggerDate.getMonth()+1)}-${p(triggerDate.getDate())}T${p(triggerDate.getHours())}:${p(triggerDate.getMinutes())}:00${sign}${p(Math.floor(abs/60))}:${p(abs%60)}`;
}

const REMINDER_PRESETS = ["5:mins","10:mins","15:mins","30:mins","1:hrs","2:hrs","1:days","1:weeks"];

function reminderValueFromRemindAt(remindAt, startDtStr) {
  if (!remindAt || !startDtStr) return "none";
  const remindDate = new Date(remindAt);
  const startDate = new Date(startDtStr);
  if (isNaN(remindDate) || isNaN(startDate)) return "none";
  const diffMs = startDate.getTime() - remindDate.getTime();
  const match = REMINDER_PRESETS.find(function(preset) {
    const parts = preset.split(":");
    return Math.abs(diffMs - Number(parts[0]) * MS_PER_UNIT[parts[1]]) < 60000;
  });
  return match || "none";
}

function openMeetingModal(meetingId) {
  if (!currentAccountId) { showError("יש לבחור לקוח תחילה"); return; }
  initFlatpickr();
  editingMeetingId = meetingId || null;
  const meeting = meetingId ? allMeetings.find(function(a) { return a.id === meetingId; }) : null;
  document.getElementById("meetingModalTitle").textContent = meeting ? "עריכת פגישה" : "פגישה חדשה";
  document.getElementById("meetingSubject").value = meeting ? (meeting.Event_Title || meeting.Subject || "") : "";
  fpStart.setDate(meeting ? (meeting.Start_DateTime || meeting.Due_Date || "") : "", false);
  fpEnd.setDate(meeting ? (meeting.End_DateTime || "") : "", false);
  if (meeting && meeting.Start_DateTime && meeting.End_DateTime) {
    syncDurationFromDates();
  } else {
    document.getElementById("meetingDurationCustomOpt").hidden = true;
    document.getElementById("meetingDuration").value = "60";
  }
  document.getElementById("meetingDesc").value = meeting ? (meeting.Description || "") : "";
  // Detect an existing online meeting robustly: reads return the localized
  // picklist label (e.g. "מחוברים"), not "Online", so match on the provisioned
  // Teams details / provider instead of the venue label alone (see isOnlineMeeting).
  // New meetings (no existing record) default to checked, since Teams is the common case.
  document.getElementById("meetingOnlineTeams").checked = meeting ? isOnlineMeeting(meeting) : true;
  if (meeting) {
    meetingParticipantEmails = (meeting.Participants || []).filter(function(p) { return p.type === "email"; }).map(function(p) { return p.participant; });
  } else {
    meetingParticipantEmails = [];
  }
  document.getElementById("meetingParticipantInput").value = "";
  hideParticipantSuggestions();
  renderMeetingParticipantChips();
  renderMeetingContactSelect();
  document.getElementById("meetingReminder").value = reminderValueFromRemindAt(meeting && meeting.Remind_At, meeting && meeting.Start_DateTime);
  const saveBtn = document.getElementById("saveMeetingBtn");
  saveBtn.disabled = false;
  saveBtn.textContent = "שמור";
  document.getElementById("meetingModal").classList.add("open");
  setTimeout(function() { document.getElementById("meetingSubject").focus(); }, 50);
}

function closeMeetingModal() {
  document.getElementById("meetingModal").classList.remove("open");
  editingMeetingId = null;
  meetingParticipantEmails = [];
  renderMeetingParticipantChips();
  document.getElementById("meetingParticipantInput").value = "";
  hideParticipantSuggestions();
  if (fpStart) fpStart.clear();
  if (fpEnd)   fpEnd.clear();
  document.getElementById("meetingDurationCustomOpt").hidden = true;
  document.getElementById("meetingDuration").value = "60";
}

function renderMeetingParticipantChips() {
  const wrap = document.getElementById("meetingParticipantChips");
  wrap.innerHTML = meetingParticipantEmails.map(function(email) {
    const contact = allContacts.find(function(c) { return c.Email === email; });
    const label = contact ? ([contact.First_Name, contact.Last_Name].filter(Boolean).join(" ") || email) : email;
    return '<span class="participant-chip">' + esc(label) +
      '<button type="button" class="participant-chip-remove" data-email="' + esc(email) + '">✕</button></span>';
  }).join("");
}

function addMeetingParticipant(raw) {
  const email = raw.trim();
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) return;
  if (meetingParticipantEmails.indexOf(email) === -1) meetingParticipantEmails.push(email);
  renderMeetingParticipantChips();
  renderMeetingContactSelect();
}

// Internal team — always offered as quick-add options regardless of which
// client the meeting is for, since they're not necessarily Zoho Contacts.
const INTERNAL_TEAM = [
{ name: "אנדריי שירוב",         email: "andrey@vitalop.com" },
  { name: "אמנון עזוז",     email: "amnon@vitalop.com" },
  { name: "גבי גולדפלד",    email: "gabi@vitalop.com" },
  { name: "כריס עלם",       email: "cris@vitalop.com" }
];

function optgroupHtml(label, items) {
  if (!items.length) return "";
  return '<optgroup label="' + esc(label) + '">' +
    items.map(function(p) { return '<option value="' + esc(p.email) + '">' + esc(p.name) + '</option>'; }).join("") +
    '</optgroup>';
}

function renderMeetingContactSelect() {
  const sel = document.getElementById("meetingContactSelect");
  const clientContacts = allContacts
    .filter(function(c) { return c.Email && meetingParticipantEmails.indexOf(c.Email) === -1; })
    .map(function(c) { return { name: [c.First_Name, c.Last_Name].filter(Boolean).join(" ") || c.Email, email: c.Email }; });
  const teamOptions = INTERNAL_TEAM.filter(function(p) {
    return meetingParticipantEmails.indexOf(p.email) === -1 &&
      !clientContacts.some(function(c) { return c.email === p.email; });
  });
  sel.innerHTML = '<option value="">+ הוסף איש קשר...</option>' +
    optgroupHtml("צוות VITAL OP", teamOptions) +
    optgroupHtml("אנשי קשר", clientContacts);
}

document.getElementById("meetingContactSelect").addEventListener("change", function() {
  if (this.value) addMeetingParticipant(this.value);
  this.value = "";
});

document.getElementById("meetingParticipantChips").addEventListener("click", function(e) {
  const btn = e.target.closest(".participant-chip-remove");
  if (!btn) return;
  meetingParticipantEmails = meetingParticipantEmails.filter(function(e) { return e !== btn.dataset.email; });
  renderMeetingParticipantChips();
  renderMeetingContactSelect();
});

// ── PARTICIPANT AUTOCOMPLETE (Zoho Contacts, org-wide) ─────────
let participantSearchTimer = null;
let participantSuggestions = [];
let participantActiveIndex = -1;

function hideParticipantSuggestions() {
  document.getElementById("meetingParticipantSuggestions").classList.add("hidden");
  participantSuggestions = [];
  participantActiveIndex = -1;
}

function renderParticipantSuggestions(results) {
  participantSuggestions = results;
  participantActiveIndex = -1;
  const box = document.getElementById("meetingParticipantSuggestions");
  if (!results.length) {
    box.innerHTML = '<div class="autocomplete-empty">אין תוצאות</div>';
  } else {
    box.innerHTML = results.map(function(c, i) {
      const name = [c.First_Name, c.Last_Name].filter(Boolean).join(" ") || c.Email;
      return `<div class="autocomplete-item" data-index="${i}">
        <div class="autocomplete-item-name">${esc(name)}</div>
        <div class="autocomplete-item-email">${esc(c.Email)}</div>
      </div>`;
    }).join("");
  }
  box.classList.remove("hidden");
}

function updateActiveSuggestion() {
  document.querySelectorAll("#meetingParticipantSuggestions .autocomplete-item").forEach(function(el, i) {
    el.classList.toggle("active", i === participantActiveIndex);
    if (i === participantActiveIndex) el.scrollIntoView({ block: "nearest" });
  });
}

function selectParticipantSuggestion(idx) {
  const c = participantSuggestions[idx];
  if (!c || !c.Email) return;
  addMeetingParticipant(c.Email);
  document.getElementById("meetingParticipantInput").value = "";
  hideParticipantSuggestions();
}

function searchParticipantContacts(query) {
  const q = query.toLowerCase();
  const teamMatches = INTERNAL_TEAM
    .filter(function(p) {
      return meetingParticipantEmails.indexOf(p.email) === -1 &&
        (p.name.toLowerCase().indexOf(q) !== -1 || p.email.toLowerCase().indexOf(q) !== -1);
    })
    .map(function(p) { return { First_Name: p.name, Last_Name: "", Email: p.email }; });

  ZOHO.CRM.API.searchRecords({ Entity: "Contacts", Type: "word", Query: query, page: 1, per_page: 8 })
    .then(function(resp) {
      const results = (resp.data || []).filter(function(c) {
        return c.Email && meetingParticipantEmails.indexOf(c.Email) === -1 &&
          !teamMatches.some(function(t) { return t.Email === c.Email; });
      });
      renderParticipantSuggestions(teamMatches.concat(results));
    })
    .catch(function(err) {
      dbg("searchParticipantContacts ✗", err, true);
      if (teamMatches.length) renderParticipantSuggestions(teamMatches);
      else hideParticipantSuggestions();
    });
}

document.getElementById("meetingParticipantInput").addEventListener("input", function() {
  const query = this.value.trim();
  clearTimeout(participantSearchTimer);
  if (query.length < 2) { hideParticipantSuggestions(); return; }
  participantSearchTimer = setTimeout(function() { searchParticipantContacts(query); }, 250);
});

document.getElementById("meetingParticipantInput").addEventListener("blur", function() {
  // Delayed so a click/mousedown on a suggestion below still registers first.
  setTimeout(hideParticipantSuggestions, 150);
});

document.getElementById("meetingParticipantSuggestions").addEventListener("mousedown", function(e) {
  const item = e.target.closest(".autocomplete-item");
  if (item) selectParticipantSuggestion(Number(item.dataset.index));
});

document.getElementById("meetingParticipantInput").addEventListener("keydown", function(e) {
  const suggestionsOpen = !document.getElementById("meetingParticipantSuggestions").classList.contains("hidden")
    && participantSuggestions.length;

  if (suggestionsOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    e.preventDefault();
    const n = participantSuggestions.length;
    participantActiveIndex = (participantActiveIndex + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
    updateActiveSuggestion();
    return;
  }
  if (suggestionsOpen && e.key === "Enter" && participantActiveIndex >= 0) {
    e.preventDefault();
    selectParticipantSuggestion(participantActiveIndex);
    return;
  }
  if (e.key === "Escape") { hideParticipantSuggestions(); return; }

  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    addMeetingParticipant(this.value);
    this.value = "";
    hideParticipantSuggestions();
  }
});

function saveMeeting() {
  const subject = document.getElementById("meetingSubject").value.trim();
  const start   = document.getElementById("meetingStart").value;
  const end     = document.getElementById("meetingEnd").value;
  const desc    = document.getElementById("meetingDesc").value.trim();
  if (!subject) { document.getElementById("meetingSubject").focus(); return; }
  if (!start)   { document.getElementById("meetingStart").focus(); return; }

  const saveBtn = document.getElementById("saveMeetingBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "שומר...";

  const apiData = {
    Event_Title: subject,
    Start_DateTime: toZohoDT(start),
    End_DateTime: toZohoDT(end || start),
    Description: desc,
    $send_notification: true
  };

  const reminderVal = document.getElementById("meetingReminder").value;
  if (reminderVal === "none") {
    apiData.Remind_At = null;
  } else {
    const parts = reminderVal.split(":");
    apiData.Remind_At = buildReminderAt(start, Number(parts[0]), parts[1]);
  }

  // Provisioning trigger — see README "Online meeting provisioning" section
  // for how this was found. Meeting_Venue__s/Meeting_Provider__s do NOT
  // trigger it; they're read-only display fields Zoho derives afterward.
  if (document.getElementById("meetingOnlineTeams").checked) {
    apiData.$meeting_details = { tool_name: "MicrosoftTeamsMeeting" };
  } else {
    apiData.Meeting_Venue__s = "Client location";
  }

  const newEmailParticipants = meetingParticipantEmails.map(function(email) { return { type: "email", participant: email }; });

  let apiCall;
  if (editingMeetingId) {
    const existingMeeting = allMeetings.find(function(a) { return a.id === editingMeetingId; });
    const otherParticipants = existingMeeting ? (existingMeeting.Participants || []).filter(function(p) { return p.type !== "email"; }) : [];
    apiData.Participants = otherParticipants.concat(newEmailParticipants);
    apiData.id = editingMeetingId;
    dbg("SAVE ▶ updateRecord Events payload", apiData);
    apiCall = ZOHO.CRM.API.updateRecord({ Entity: "Events", APIData: apiData, Trigger: [] });
  } else {
    if (newEmailParticipants.length) apiData.Participants = newEmailParticipants;
    apiData.What_Id = currentAccountId;
    apiData.$se_module = "Accounts";
    dbg("SAVE ▶ insertRecord Events payload", apiData);
    apiCall = ZOHO.CRM.API.insertRecord({ Entity: "Events", APIData: apiData });
  }

  apiCall.then(function(resp) {
    dbg("SAVE ✓ raw API response", resp);
    const result = (resp && resp.data && resp.data[0]) || null;
    const savedId = editingMeetingId || (result && result.details && result.details.id);
    if (savedId) traceMeetingRecord(savedId, "SAVE");
    closeMeetingModal();
    reloadActivities();
  }).catch(function(err) {
    dbg("SAVE ✗ API call failed", err, true);
    saveBtn.disabled = false;
    saveBtn.textContent = "שמור";
    showError("לא ניתן לשמור פגישה — " + JSON.stringify(err));
  });
}

// Polls a meeting record over time and logs it, since $meeting_details can be
// populated by Zoho asynchronously after the insert/update call resolves. Logs
// the Teams-relevant fields as a compact summary (the dbg panel truncates long
// JSON at 1000 chars, which was cutting these fields off before they appeared)
// plus the untruncated full record to the browser console.
function traceMeetingRecord(id, label) {
  [0, 3000, 6000, 10000, 15000].forEach(function(delayMs) {
    setTimeout(function() {
      ZOHO.CRM.API.getRecord({ Entity: "Events", RecordID: id })
        .then(function(r) {
          const rec = (r.data || [])[0] || null;
          console.log(label + " (+" + (delayMs / 1000) + "s) full record " + id, rec);
          dbg(label + " (+" + (delayMs / 1000) + "s) key fields " + id, rec && {
            Meeting_Venue__s: rec.Meeting_Venue__s,
            Meeting_Provider__s: rec.Meeting_Provider__s,
            Online_Meeting_External_UUID__s: rec.Online_Meeting_External_UUID__s,
            $meeting_details: rec.$meeting_details,
            Venue: rec.Venue
          });
        })
        .catch(function(e) { dbg(label + " (+" + (delayMs / 1000) + "s) getRecord ✗", e, true); });
    }, delayMs);
  });
}

// Standalone, isolated test: creates its own meeting (bypassing the modal's date
// pickers entirely) and traces it, to rule out UI-state bugs when diagnosing why
// a Teams meeting isn't provisioning. Uses the $meeting_details.tool_name input
// field (confirmed via a working Zoho support sample for Zoom) instead of
// Meeting_Venue__s/Meeting_Provider__s, which don't actually trigger
// provisioning — they're derived display fields set after the fact.
function debugTraceMeetingCreation() {
  if (!currentAccountId) { dbg("⚠ אין לקוח נבחר", null, true); return; }

  ZOHO.CRM.CONFIG.getCurrentUser().then(function(userResp) {
    const me = userResp && userResp.users && userResp.users[0];
    const meEmail = me && me.email;
    dbg("TRACE ▶ current user", me);

    const start = new Date(Date.now() + 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const pad = function(n) { return String(n).padStart(2, "0"); };
    const fmt = function(d) {
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    };
    const apiData = {
      Event_Title: "DEBUG-TRACE-" + Date.now(),
      Start_DateTime: toZohoDT(fmt(start)),
      End_DateTime: toZohoDT(fmt(end)),
      Description: "Automated debug trace — safe to delete",
      $send_notification: false,
      $meeting_details: { tool_name: "MicrosoftTeamsMeeting" },
      What_Id: currentAccountId,
      $se_module: "Accounts"
    };
    if (meEmail) apiData.Participants = [{ type: "email", participant: meEmail }];
    dbg("TRACE ▶ outgoing insertRecord payload", apiData);

    ZOHO.CRM.API.insertRecord({ Entity: "Events", APIData: apiData })
      .then(function(resp) {
        dbg("TRACE ✓ insertRecord raw response", resp);
        const result = (resp.data || [])[0];
        if (!result || result.status !== "success") { dbg("TRACE ✗ insert did not report success", result, true); return; }
        traceMeetingRecord(result.details.id, "TRACE");
      })
      .catch(function(e) { dbg("TRACE ✗ insertRecord failed", e, true); });
  }).catch(function(e) { dbg("TRACE ✗ getCurrentUser failed", e, true); });
}

// ── TASK MODAL ────────────────────────────────────────────────
let editingTaskId = null;

function openTaskModal(taskId) {
  if (!taskId && !currentAccountId) { showError("יש לבחור לקוח תחילה"); return; }
  initTaskFlatpickr();
  editingTaskId = taskId || null;
  const task = taskId ? allTasks.find(function(t) { return t.id === taskId; }) : null;
  if (taskId && !task) return;
  document.getElementById("taskModalTitle").textContent = task ? "עריכת משימה" : "משימה חדשה";
  document.getElementById("taskSubject").value = task ? (task.Subject || "") : "";
  fpTaskDue.setDate(task ? (task.Due_Date || "") : "", false);
  document.getElementById("taskPriority").value = task ? (task.Priority || "Normal") : "Normal";
  document.getElementById("taskStatus").value = task ? (task.Status || "Not Started") : "Not Started";
  document.getElementById("taskDesc").value = task ? (task.Description || "") : "";
  const saveBtn = document.getElementById("saveTaskBtn");
  saveBtn.disabled = false;
  saveBtn.textContent = "שמור";
  document.getElementById("taskModal").classList.add("open");
  setTimeout(function() { document.getElementById("taskSubject").focus(); }, 50);
}

function closeTaskModal() {
  document.getElementById("taskModal").classList.remove("open");
  editingTaskId = null;
  if (fpTaskDue) fpTaskDue.clear();
}

function saveTask() {
  const subject = document.getElementById("taskSubject").value.trim();
  const due      = document.getElementById("taskDueDate").value;
  const priority = document.getElementById("taskPriority").value;
  const status   = document.getElementById("taskStatus").value;
  const desc     = document.getElementById("taskDesc").value.trim();
  if (!subject) { document.getElementById("taskSubject").focus(); return; }

  const saveBtn = document.getElementById("saveTaskBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "שומר...";

  const apiData = {
    Subject: subject,
    Due_Date: due || null,
    Priority: priority,
    Status: status,
    Description: desc
  };

  let apiCall;
  if (editingTaskId) {
    apiData.id = editingTaskId;
    apiCall = ZOHO.CRM.API.updateRecord({ Entity: "Tasks", APIData: apiData, Trigger: [] });
  } else {
    apiData.What_Id = currentAccountId;
    apiData.$se_module = "Accounts";
    apiCall = ZOHO.CRM.API.insertRecord({ Entity: "Tasks", APIData: apiData });
  }

  apiCall.then(function() {
    closeTaskModal();
    reloadTasks();
  }).catch(function(err) {
    saveBtn.disabled = false;
    saveBtn.textContent = "שמור";
    showError("לא ניתן לשמור משימה — " + JSON.stringify(err));
  });
}

function reloadTasks() {
  if (!currentAccountId) return;
  ZOHO.CRM.API.getRelatedRecords({ Entity: "Accounts", RecordID: currentAccountId, RelatedList: "Tasks", page: 1, per_page: 50 })
    .then(function(resp) {
      allTasks = resp.data || [];
      renderTasks();
    })
    .catch(function(err) { showError("לא ניתן לרענן משימות — " + JSON.stringify(err)); });
}

document.getElementById("taskModal").addEventListener("click", function(e) {
  if (e.target === this) closeTaskModal();
});

function loadMeetings(accountId) {
  dbg("loadMeetings → getRelatedRecords Accounts/" + accountId + "/Events", null, false);
  ZOHO.CRM.API.getRelatedRecords({
    Entity: "Accounts",
    RecordID: accountId,
    RelatedList: "Events",
    page: 1,
    per_page: 50
  }).then(function(resp) {
    dbg("loadMeetings ← getRelatedRecords Events", resp, false);
    if (resp && resp.data && resp.data.length > 0) {
      allMeetings = resp.data;
      renderActivities();
      return;
    }
    // fallback: searchRecords criteria
    dbg("loadMeetings → fallback searchRecords Events What_Id:equals:" + accountId, null, false);
    return ZOHO.CRM.API.searchRecords({
      Entity: "Events",
      Type: "criteria",
      Query: "(What_Id:equals:" + accountId + ")"
    }).then(function(resp2) {
      dbg("loadMeetings ← searchRecords Events", resp2, false);
      allMeetings = resp2.data || [];
      renderActivities();
    });
  }).catch(function(err) {
    dbg("loadMeetings ← getRelatedRecords ERROR, trying searchRecords fallback", err, true);
    ZOHO.CRM.API.searchRecords({
      Entity: "Events",
      Type: "criteria",
      Query: "(What_Id:equals:" + accountId + ")"
    }).then(function(resp2) {
      dbg("loadMeetings ← fallback searchRecords Events", resp2, false);
      allMeetings = resp2.data || [];
      renderActivities();
    }).catch(function(err2) {
      dbg("loadMeetings ← all attempts failed", err2, true);
      allMeetings = [];
    });
  });
}

function reloadActivities() {
  loadMeetings(currentAccountId);
}

document.getElementById("actionList").addEventListener("click", function(e) {
  const deleteBtn = e.target.closest(".delete-meeting-btn");
  if (deleteBtn && deleteBtn.dataset.meetingId) {
    deleteMeeting(deleteBtn.dataset.meetingId);
    return;
  }
  const editBtn = e.target.closest(".edit-meeting-btn");
  if (editBtn && editBtn.dataset.meetingId) openMeetingModal(editBtn.dataset.meetingId);
});

function deleteMeeting(meetingId) {
  if (!confirm("לבטל את הפגישה? הפעולה אינה הפיכה.")) return;
  ZOHO.CRM.API.deleteRecord({ Entity: "Events", RecordID: meetingId }).then(function() {
    if (currentAccountId) reloadActivities();
    loadHomeView();
  }).catch(function(err) {
    showError("לא ניתן לבטל את הפגישה — " + JSON.stringify(err));
  });
}

document.getElementById("meetingModal").addEventListener("click", function(e) {
  if (e.target === this) closeMeetingModal();
});
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") { closeRemarkModal(); closeMeetingModal(); closeImportMeetingModal(); }
});

// ── HOME VIEW ─────────────────────────────────────────────────
var allHomeMeetings = [];
var homeMeetingTimeFilter = "upcoming";
var homeMeetingView = "list";
var homeCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
var homeCalendarSelectedDate = new Date();

function loadHomeView() {
  Promise.all([
    ZOHO.CRM.API.getAllRecords({ Entity: "Tasks", sort_order: "asc", sort_by: "Due_Date", per_page: 50, page: 1 }),
    ZOHO.CRM.API.getAllRecords({ Entity: "Events", sort_order: "asc", sort_by: "Start_DateTime", per_page: 50, page: 1 }),
    ZOHO.CRM.API.getAllRecords({ Entity: "Meeting_Summaries", per_page: 100, page: 1 })
  ]).then(function(results) {
    var openTasks = (results[0].data || []).filter(function(t) { return t.Status !== "Completed"; });
    allHomeMeetings = results[1].data || [];
    allHomeMeetingSummaries = results[2].data || [];
    renderHomeTasks(openTasks);
    renderHomeMeetingsView();
    renderPendingSummaries();
    processActionItems(allHomeMeetingSummaries.filter(function(s) { return s.Account && s.Action_Items_JSON; }));
  }).catch(function(err) {
    dbg("loadHomeView ERROR", err, true);
    document.getElementById("homeTaskList").innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div>שגיאה בטעינה</div></div>';
    document.getElementById("homeMeetingList").innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div>שגיאה בטעינה</div></div>';
    document.getElementById("pendingSummaryList").innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div>שגיאה בטעינה</div></div>';
  });
}

// ── ACTION ITEMS → TASKS ────────────────────────────────────────
function processActionItems(summaries) {
  (summaries || []).forEach(function(s) {
    if (!s.Account || !s.Action_Items_JSON) return;
    let items;
    try { items = JSON.parse(s.Action_Items_JSON); } catch (e) { items = null; }
    const accountId = (s.Account && s.Account.id) || s.Account;

    if (Array.isArray(items) && items.length) {
      const dueDate = s.Meeting_Date ? new Date(s.Meeting_Date) : new Date();
      dueDate.setDate(dueDate.getDate() + 3);
      const dueDateStr = dueDate.toISOString().slice(0, 10);
      items.forEach(function(item) {
        const subject = stripHtmlTags(typeof item === "string" ? item : ((item && (item.task || item.title || item.text)) || String(item)));
        const extra = [];
        if (item && item.owner) extra.push("אחראי: " + stripHtmlTags(item.owner));
        if (item && item.deadline_text) extra.push("יעד: " + stripHtmlTags(item.deadline_text));
        ZOHO.CRM.API.insertRecord({
          Entity: "Tasks",
          APIData: {
            Subject: subject,
            Description: extra.join(" · "),
            Due_Date: dueDateStr,
            Priority: "Normal",
            Status: "Not Started",
            What_Id: accountId,
            $se_module: "Accounts"
          }
        }).catch(function(err) { dbg("processActionItems ✗ insertRecord Task", err, true); });
      });
    }

    ZOHO.CRM.API.updateRecord({
      Entity: "Meeting_Summaries",
      APIData: { id: s.id, Action_Items_JSON: "" },
      Trigger: []
    }).catch(function(err) { dbg("processActionItems ✗ clear Action_Items_JSON", err, true); });
  });
}

// ── PENDING SUMMARIES (home screen inbox) ───────────────────────
function renderPendingSummaries() {
  const pending = allHomeMeetingSummaries.filter(function(s) { return !s.Account; });
  document.getElementById("pendingSummaryCount").textContent = pending.length;
  const list = document.getElementById("pendingSummaryList");
  if (!pending.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🧾</div><div>אין תקצירים ממתינים לשיוך</div></div>';
    return;
  }
  list.innerHTML = pending.map(function(s) {
    return `
      <div class="summary-card">
        <div class="summary-header">
          <div class="summary-title">${esc(s.Name || "פגישה")}</div>
          ${s.Meeting_Date ? `<span class="summary-date">${fmtDate(s.Meeting_Date)}</span>` : ""}
        </div>
        ${s.Short_Summary ? `<div class="summary-short">${sanitizeSummaryHtml(s.Short_Summary)}</div>` : ""}
        <div class="action-footer">
          <button class="assign-btn" data-summary-id="${esc(s.id)}">שייך ללקוח</button>
        </div>
      </div>`;
  }).join("");
}

document.getElementById("pendingSummaryList").addEventListener("click", function(e) {
  const btn = e.target.closest(".assign-btn");
  if (btn && btn.dataset.summaryId) openAssignSummaryModal(btn.dataset.summaryId);
});

function openAssignSummaryModal(summaryId) {
  const s = allHomeMeetingSummaries.find(function(x) { return x.id === summaryId; });
  if (!s) return;
  assigningSummaryId = summaryId;
  document.getElementById("assignSummarySubject").textContent = s.Name || "פגישה";
  const sel = document.getElementById("assignSummaryClientSelect");
  const clientOptions = document.getElementById("clientSelect").querySelectorAll("option[value]:not([value=''])");
  sel.innerHTML = '<option value="">— בחר לקוח —</option>' +
    Array.prototype.map.call(clientOptions, function(o) {
      return '<option value="' + esc(o.value) + '">' + esc(o.textContent) + '</option>';
    }).join("");
  const saveBtn = document.getElementById("saveAssignSummaryBtn");
  saveBtn.disabled = false;
  saveBtn.textContent = "שייך";
  document.getElementById("assignSummaryModal").classList.add("open");
}

function closeAssignSummaryModal() {
  document.getElementById("assignSummaryModal").classList.remove("open");
  assigningSummaryId = null;
}

function saveAssignSummary() {
  const accountId = document.getElementById("assignSummaryClientSelect").value;
  if (!accountId || !assigningSummaryId) return;
  const saveBtn = document.getElementById("saveAssignSummaryBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "משייך...";

  ZOHO.CRM.API.updateRecord({
    Entity: "Meeting_Summaries",
    APIData: { id: assigningSummaryId, Account: accountId },
    Trigger: []
  }).then(function() {
    const s = allHomeMeetingSummaries.find(function(x) { return x.id === assigningSummaryId; });
    if (s) {
      s.Account = { id: accountId };
      processActionItems([s]);
    }
    closeAssignSummaryModal();
    renderPendingSummaries();
    if (currentAccountId === accountId) loadMeetingSummaries(accountId);
  }).catch(function(err) {
    saveBtn.disabled = false;
    saveBtn.textContent = "שייך";
    showError("לא ניתן לשייך תקציר — " + JSON.stringify(err));
  });
}

document.getElementById("assignSummaryModal").addEventListener("click", function(e) {
  if (e.target === this) closeAssignSummaryModal();
});

function renderHomeTasks(tasks) {
  document.getElementById("homeTaskCount").textContent = tasks.length;
  var el = document.getElementById("homeTaskList");
  if (!tasks.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><div>אין משימות פתוחות</div></div>';
    return;
  }
  el.innerHTML = tasks.map(function(t) {
    var priClass = t.Priority === "High" ? "badge-high" : t.Priority === "Normal" ? "badge-med" : "badge-low";
    var priLabel = t.Priority === "High" ? "גבוהה" : t.Priority === "Normal" ? "רגילה" : (t.Priority || "");
    var clientName = t.What_Id && t.What_Id.name ? t.What_Id.name : "";
    var clientId   = t.What_Id && t.What_Id.id   ? t.What_Id.id   : "";
    return '<div class="task-card">' +
      '<div class="task-title">' + esc(t.Subject || "") + '</div>' +
      '<div class="task-meta">' +
        (priLabel ? '<span class="badge ' + priClass + '">' + esc(priLabel) + '</span>' : '') +
        (t.Due_Date ? '<span class="due-date ' + (isOverdue(t.Due_Date) ? "overdue" : "") + '">' + fmtDate(t.Due_Date) + '</span>' : '') +
        (clientId ? '<button class="ht-client" onclick="goToClient(\'' + esc(clientId) + '\')">' + esc(clientName) + '</button>' : '') +
      '</div>' +
    '</div>';
  }).join("");
}

function homeMeetingCardHtml(m) {
  var title      = m.Event_Title || m.Subject || "פגישה";
  var clientName = m.What_Id && m.What_Id.name ? m.What_Id.name : "";
  var clientId   = m.What_Id && m.What_Id.id   ? m.What_Id.id   : "";
  var joinUrl    = getJoinUrl(m);
  var isDone     = m.Status === "Completed";
  return '<div class="action-card' + (isDone ? ' done-action' : '') + '">' +
    '<div class="action-header">' +
      '<div class="action-title">' + esc(title) + '</div>' +
      (m.Start_DateTime ? '<span class="meeting-date upcoming">' + fmtDateTime(m.Start_DateTime) + '</span>' : '') +
      (isToday(m.Start_DateTime) ? '<span class="badge badge-today">היום</span>' : '') +
    '</div>' +
    '<div class="action-footer">' +
      '<button class="edit-meeting-btn delete-meeting-btn" data-meeting-id="' + esc(m.id) + '">🗑 בטל פגישה</button>' +
      (joinUrl ? '<a class="crm-link" href="' + esc(joinUrl) + '" target="_blank">🟦 הצטרף ל-Teams ↗</a>' : '') +
      (clientId ? '<button class="ht-client" onclick="goToClient(\'' + esc(clientId) + '\')">' + esc(clientName) + '</button>' : '') +
    '</div>' +
  '</div>';
}

function renderHomeMeetingsView() {
  document.getElementById("homeMeetingTimeFilters").classList.toggle("hidden", homeMeetingView === "calendar");
  document.getElementById("homeMeetingList").classList.toggle("hidden", homeMeetingView !== "list");
  document.getElementById("homeMeetingCalendar").classList.toggle("hidden", homeMeetingView !== "calendar");
  if (homeMeetingView === "calendar") renderHomeMeetingsCalendar();
  else renderHomeMeetingsList();
}

function renderHomeMeetingsList() {
  var now = new Date();
  var meetings = allHomeMeetings.filter(function(m) {
    if (!m.Start_DateTime) return false;
    var d = new Date(m.Start_DateTime);
    return homeMeetingTimeFilter === "upcoming" ? d >= now : d < now;
  }).sort(function(a, b) {
    var da = new Date(a.Start_DateTime), db = new Date(b.Start_DateTime);
    return homeMeetingTimeFilter === "upcoming" ? da - db : db - da;
  });

  document.getElementById("homeMeetingCount").textContent = meetings.length;
  var el = document.getElementById("homeMeetingList");
  if (!meetings.length) {
    var msg = homeMeetingTimeFilter === "upcoming" ? "אין פגישות עתידיות" : "אין פגישות קודמות";
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><div>' + msg + '</div></div>';
    return;
  }
  el.innerHTML = meetings.map(homeMeetingCardHtml).join("");
}

document.getElementById("homeView").addEventListener("click", function(e) {
  var deleteBtn = e.target.closest(".delete-meeting-btn");
  if (deleteBtn && deleteBtn.dataset.meetingId) deleteMeeting(deleteBtn.dataset.meetingId);
});

document.getElementById("homeMeetingTimeFilters").addEventListener("click", function(e) {
  var btn = e.target.closest(".filter-btn");
  if (!btn) return;
  document.querySelectorAll("#homeMeetingTimeFilters .filter-btn").forEach(function(b) { b.className = "filter-btn"; });
  btn.classList.add("active-a");
  homeMeetingTimeFilter = btn.dataset.tf;
  document.getElementById("homeMeetingPanelTitle").textContent = homeMeetingTimeFilter === "upcoming" ? "פגישות עתידיות" : "פגישות קודמות";
  renderHomeMeetingsList();
});

document.getElementById("homeMeetingViewToggle").addEventListener("click", function(e) {
  var btn = e.target.closest(".view-toggle-btn");
  if (!btn) return;
  document.querySelectorAll("#homeMeetingViewToggle .view-toggle-btn").forEach(function(b) { b.classList.remove("active"); });
  btn.classList.add("active");
  homeMeetingView = btn.dataset.view;
  renderHomeMeetingsView();
});

function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function renderHomeMeetingsCalendar() {
  var year = homeCalendarMonth.getFullYear();
  var month = homeCalendarMonth.getMonth();
  var firstDay = new Date(year, month, 1);
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var startOffset = firstDay.getDay();
  var today = new Date();
  var monthNames = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
  var weekdayNames = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];

  var meetingsByDay = {};
  allHomeMeetings.forEach(function(m) {
    if (!m.Start_DateTime) return;
    var d = new Date(m.Start_DateTime);
    if (d.getFullYear() === year && d.getMonth() === month) {
      var day = d.getDate();
      (meetingsByDay[day] = meetingsByDay[day] || []).push(m);
    }
  });

  var cells = "";
  for (var i = 0; i < startOffset; i++) cells += '<div class="cal-day empty"></div>';
  for (var day = 1; day <= daysInMonth; day++) {
    var cellDate = new Date(year, month, day);
    var isToday = isSameDate(cellDate, today);
    var isSelected = isSameDate(cellDate, homeCalendarSelectedDate);
    var hasMeetings = !!meetingsByDay[day];
    cells += '<div class="cal-day' + (isToday ? " today" : "") + (isSelected ? " selected" : "") + '" data-day="' + day + '">' +
      day + (hasMeetings ? '<div class="cal-day-dot"></div>' : '') +
      '</div>';
  }

  var agendaMeetings = (meetingsByDay[homeCalendarSelectedDate.getMonth() === month && homeCalendarSelectedDate.getFullYear() === year ? homeCalendarSelectedDate.getDate() : -1] || []);
  var agendaHtml = agendaMeetings.length
    ? agendaMeetings.sort(function(a, b) { return new Date(a.Start_DateTime) - new Date(b.Start_DateTime); }).map(homeMeetingCardHtml).join("")
    : '<div class="cal-agenda-empty">אין פגישות בתאריך זה</div>';

  document.getElementById("homeMeetingCalendar").innerHTML =
    '<div class="cal-header">' +
      '<button class="cal-nav-btn" id="calPrevBtn">‹</button>' +
      '<div class="cal-title">' + monthNames[month] + " " + year + '</div>' +
      '<button class="cal-nav-btn" id="calNextBtn">›</button>' +
    '</div>' +
    '<div class="cal-grid">' +
      weekdayNames.map(function(w) { return '<div class="cal-weekday">' + w + '</div>'; }).join("") +
      cells +
    '</div>' +
    '<div class="cal-agenda">' +
      '<div class="cal-agenda-title">' + fmtDate(homeCalendarSelectedDate.toISOString()) + '</div>' +
      agendaHtml +
    '</div>';

  document.getElementById("calPrevBtn").onclick = function() {
    homeCalendarMonth = new Date(year, month - 1, 1);
    renderHomeMeetingsCalendar();
  };
  document.getElementById("calNextBtn").onclick = function() {
    homeCalendarMonth = new Date(year, month + 1, 1);
    renderHomeMeetingsCalendar();
  };
  document.getElementById("homeMeetingCalendar").querySelectorAll(".cal-day[data-day]").forEach(function(cell) {
    cell.addEventListener("click", function() {
      homeCalendarSelectedDate = new Date(year, month, Number(cell.dataset.day));
      renderHomeMeetingsCalendar();
    });
  });
}

function goToClient(accountId) {
  var sel = document.getElementById("clientSelect");
  sel.value = accountId;
  var opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) return;
  loadClientData(opt.value, {
    name:     opt.textContent,
    phone:    opt.dataset.phone    || "",
    industry: opt.dataset.industry || "",
    owner:    opt.dataset.owner    || "",
    status:   opt.dataset.status   || ""
  });
}
