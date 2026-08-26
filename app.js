
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
let taskFilter = "all", noteFilter = "all", meetingTimeFilter = "upcoming";
let currentAccountId = null, remarkTaskId = null, editingMeetingId = null, editingContactId = null;
let meetingParticipantEmails = [];

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
  document.getElementById("contactsBar").classList.add("hidden");
  document.getElementById("clientSelect").value = "";
  currentAccountId = null;
  sessionStorage.removeItem("crm_lastAccountId");
  setClientStatusSelect("");
  document.getElementById("clientStatusSelect").disabled = true;
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
    if (opt) opt.dataset.status = newStatus;
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
  document.getElementById("mainPanels").classList.remove("hidden");
  document.getElementById("contactsBar").classList.remove("hidden");

  currentAccountId = id;
  sessionStorage.setItem("crm_lastAccountId", id);
  document.getElementById("clientName").textContent = meta.name;
  document.getElementById("clientMeta").textContent =
    [meta.owner    ? "אחראי: " + meta.owner    : "",
     meta.industry || "",
     meta.phone    || ""].filter(Boolean).join("  ·  ");
  setClientStatusSelect(meta.status || "");
  document.getElementById("clientStatusSelect").disabled = false;

  ["statTasks","statNotes","statActions"].forEach(function(s) {
    document.getElementById(s).textContent = "…";
  });

  allMeetings = [];
  showSpinner("taskList");
  showSpinner("noteList");
  showSpinner("actionList");

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
        ${isArchive
          ? '<span class="done-check">✓</span>'
          : `<button class="done-btn" data-task-id="${esc(t.id)}" title="סמן כהושלם">✓</button>`}
        <div class="task-title">${esc(t.Subject || "משימה ללא שם")}</div>
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
    const done     = a.Status === "Completed";
    const desc     = (a.Description || "").trim();
    const meetDate = a.Start_DateTime || "";
    const upcoming = meetDate && new Date(meetDate) >= now;
    const joinUrl  = a.$meeting_details && a.$meeting_details.joinmeeting_url;
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
let fpStart = null, fpEnd = null, fpTaskDue = null;

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
  // Teams details / provider instead of the venue label alone. New meetings
  // (no existing record) default to checked, since Teams is the common case.
  document.getElementById("meetingOnlineTeams").checked = meeting ? !!(
    (meeting.$meeting_details && meeting.$meeting_details.joinmeeting_url) ||
    meeting.Meeting_Provider__s ||
    meeting.Meeting_Venue__s === "Online"
  ) : true;
  if (meeting) {
    meetingParticipantEmails = (meeting.Participants || []).filter(function(p) { return p.type === "email"; }).map(function(p) { return p.participant; });
  } else {
    meetingParticipantEmails = [];
  }
  document.getElementById("meetingParticipantInput").value = "";
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

function renderMeetingContactSelect() {
  const sel = document.getElementById("meetingContactSelect");
  const available = allContacts.filter(function(c) {
    return c.Email && meetingParticipantEmails.indexOf(c.Email) === -1;
  });
  sel.innerHTML = '<option value="">+ הוסף איש קשר...</option>' +
    available.map(function(c) {
      const name = [c.First_Name, c.Last_Name].filter(Boolean).join(" ") || c.Email;
      return '<option value="' + esc(c.Email) + '">' + esc(name) + '</option>';
    }).join("");
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

document.getElementById("meetingParticipantInput").addEventListener("keydown", function(e) {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    addMeetingParticipant(this.value);
    this.value = "";
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
  if (e.key === "Escape") { closeRemarkModal(); closeMeetingModal(); }
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
    ZOHO.CRM.API.getAllRecords({ Entity: "Events", sort_order: "asc", sort_by: "Start_DateTime", per_page: 50, page: 1 })
  ]).then(function(results) {
    var openTasks = (results[0].data || []).filter(function(t) { return t.Status !== "Completed"; });
    allHomeMeetings = results[1].data || [];
    renderHomeTasks(openTasks);
    renderHomeMeetingsView();
  }).catch(function(err) {
    dbg("loadHomeView ERROR", err, true);
    document.getElementById("homeTaskList").innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div>שגיאה בטעינה</div></div>';
    document.getElementById("homeMeetingList").innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div>שגיאה בטעינה</div></div>';
  });
}

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
      (priLabel ? '<span class="badge ' + priClass + '">' + esc(priLabel) + '</span>' : '') +
      (t.Due_Date ? '<span class="due-date ' + (isOverdue(t.Due_Date) ? "overdue" : "") + '">' + fmtDate(t.Due_Date) + '</span>' : '') +
      (clientId ? '<button class="ht-client" onclick="goToClient(\'' + esc(clientId) + '\')">' + esc(clientName) + '</button>' : '') +
    '</div>';
  }).join("");
}

function homeMeetingCardHtml(m) {
  var title      = m.Event_Title || m.Subject || "פגישה";
  var clientName = m.What_Id && m.What_Id.name ? m.What_Id.name : "";
  var clientId   = m.What_Id && m.What_Id.id   ? m.What_Id.id   : "";
  var joinUrl    = m.$meeting_details && m.$meeting_details.joinmeeting_url;
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
