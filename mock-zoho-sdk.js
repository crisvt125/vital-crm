/*
 * Local stand-in for Zoho's embedded-app SDK (ZOHO.embeddedApp / ZOHO.CRM.API /
 * ZOHO.CRM.META), loaded instead of the real https://live.zwidgets.com script
 * when running outside Zoho's iframe (see the loader in index.html). Backed by
 * an in-memory dataset seeded on first run and persisted to localStorage so
 * inserts/updates survive a page reload, like the real CRM would.
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "crm_mock_db_v1";
  var NETWORK_DELAY_MS = 220;

  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function toZohoIso(d) {
    var off = -d.getTimezoneOffset();
    var sign = off >= 0 ? "+" : "-";
    var abs = Math.abs(off);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":00" +
      sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60);
  }

  function daysFromNow(days, hour, minute) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour != null ? hour : 9, minute != null ? minute : 0, 0, 0);
    return toZohoIso(d);
  }

  function laterToday(hoursFromNow, extraMinutes) {
    var d = new Date();
    d.setHours(d.getHours() + hoursFromNow, extraMinutes || 0, 0, 0);
    return toZohoIso(d);
  }

  function nowIso() { return toZohoIso(new Date()); }

  function delay(value) {
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(value); }, NETWORK_DELAY_MS);
    });
  }

  // ── SEED DATA ─────────────────────────────────────────────────
  function buildSeedDb() {
    var owner = { id: "owner_1", name: "רועי כהן" };
    var accA = "acc_1001", accB = "acc_1002", accC = "acc_1003";

    var refA = { id: accA, name: 'חברת דוגמה בע"מ' };
    var refB = { id: accB, name: "טכנולוגיות אלפא" };
    var refC = { id: accC, name: "משפחת לוי" };
    var evtAifion = uid("evt");

    return {
      Accounts: [
        { id: accA, Account_Name: refA.name, Phone: "03-1234567", Industry: "ביטוח", Owner: owner, Website: "https://example.co.il", Account_Number: "10021", Created_Time: daysFromNow(-120), field6: "לקוח פעיל" },
        { id: accB, Account_Name: refB.name, Phone: "09-7654321", Industry: "הייטק", Owner: owner, Website: "https://alpha-tech.example", Account_Number: "10022", Created_Time: daysFromNow(-80), field6: "לקוח פוטנציאלי" },
        { id: accC, Account_Name: refC.name, Phone: "052-9998877", Industry: "פרטי", Owner: owner, Website: "", Account_Number: "10023", Created_Time: daysFromNow(-30), field6: "לקוח לא פעיל" }
      ],
      Contacts: [
        { id: uid("con"), First_Name: "דנה", Last_Name: "לוי", Mobile: "050-1112222", Email: "dana@example.co.il", Account_Name: refA, Owner: owner },
        { id: uid("con"), First_Name: "יוסי", Last_Name: "אברהם", Mobile: "052-3334444", Email: "yossi@alpha-tech.example", Account_Name: refB, Owner: owner },
        { id: uid("con"), First_Name: "מיכל", Last_Name: "לוי", Mobile: "054-5556666", Email: "michal@example.co.il", Account_Name: refC, Owner: owner }
      ],
      Tasks: [
        { id: uid("task"), Subject: "לשלוח הצעת חידוש פוליסה", Due_Date: daysFromNow(2).slice(0, 10), Priority: "High", Status: "Not Started", Description: "", What_Id: refA, $se_module: "Accounts", Owner: owner },
        { id: uid("task"), Subject: "לתאם פגישת היכרות עם מנהל הכספים", Due_Date: daysFromNow(-3).slice(0, 10), Priority: "Normal", Status: "Not Started", Description: "", What_Id: refB, $se_module: "Accounts", Owner: owner },
        { id: uid("task"), Subject: "לעדכן פרטי התקשרות במערכת", Due_Date: daysFromNow(-1).slice(0, 10), Priority: "Low", Status: "Completed", Description: "", What_Id: refC, $se_module: "Accounts", Owner: owner }
      ],
      Notes: [
        { id: uid("note"), Note_Title: "שיחת טלפון ראשונית", Note_Content: "הלקוח מעוניין להרחיב את הכיסוי הביטוחי לרכוש נוסף.", Created_Time: daysFromNow(-10), Created_By: owner, Parent_Id: refA, $se_module: "Accounts" }
      ],
      Events: [
        {
          id: uid("evt"), Event_Title: "פגישת סטטוס רבעונית", Description: "סקירת ביצועים רבעונית וחידוש חוזה.",
          Start_DateTime: laterToday(3), End_DateTime: laterToday(3, 30),
          Status: "Not Started", What_Id: refA, $se_module: "Accounts", Owner: owner,
          Meeting_Venue__s: "Online", Meeting_Provider__s: "Microsoft Teams",
          $meeting_details: { joinmeeting_url: "https://teams.microsoft.com/l/meetup-join/mock-demo-1" }
        },
        {
          id: uid("evt"), Event_Title: "שיחת המשך לגבי הצעת מחיר", Description: "לוודא שהצעת המחיר התקבלה ולענות על שאלות.",
          Start_DateTime: daysFromNow(-2, 14, 0), End_DateTime: daysFromNow(-2, 14, 30),
          Status: "Not Started", What_Id: refB, $se_module: "Accounts", Owner: owner
        },
        {
          id: evtAifion, Event_Title: "פגישת אפיון ראשונית", Description: "פגישה ראשונית להיכרות עם הצרכים.",
          Start_DateTime: daysFromNow(-9, 10, 0), End_DateTime: daysFromNow(-9, 10, 30),
          Status: "Completed", What_Id: refA, $se_module: "Accounts", Owner: owner
        },
        {
          id: uid("evt"), Event_Title: "פגישת תכנון שנתית", Description: "",
          Start_DateTime: daysFromNow(6, 12, 0), End_DateTime: daysFromNow(6, 13, 0),
          Status: "Not Started", What_Id: refC, $se_module: "Accounts", Owner: owner
        },
        {
          id: uid("evt"), Event_Title: "שיחת מעקב רבעונית", Description: "מעקב אחר השירותים הניתנים ובחינת צרכים נוספים.",
          Start_DateTime: daysFromNow(-5, 11, 0), End_DateTime: daysFromNow(-5, 11, 30),
          Status: "Not Started", What_Id: refB, $se_module: "Accounts", Owner: owner,
          Meeting_Venue__s: "Online", Meeting_Provider__s: "Microsoft Teams",
          $meeting_details: { joinmeeting_url: "https://teams.microsoft.com/l/meetup-join/mock-needs-recap" }
        },
        {
          id: uid("evt"), Event_Title: "פגישה שנקבעה ישירות ב-Outlook", Description: "",
          Start_DateTime: daysFromNow(-3, 15, 0), End_DateTime: daysFromNow(-3, 15, 30),
          Status: "Not Started", What_Id: refC, $se_module: "Accounts", Owner: owner,
          Imported_Teams_Meeting_Id: "19:meeting_mockimported@thread.v2"
        }
      ],
      Meeting_Summaries: [
        {
          id: uid("msum"), Name: "פגישת אפיון ראשונית", Meeting_Date: daysFromNow(-9, 10, 0),
          Short_Summary: "הוצגו הצרכים הביטוחיים העיקריים של הלקוח וסוכם על <strong>המשך בדיקת אפשרויות</strong>.",
          Long_Summary: "נסקרו הכיסויים הקיימים מול הצרכים בפועל. הלקוח ביקש הצעת מחיר לשני מוצרים נוספים ולוודא תיאום עם רואה החשבון שלו לפני קבלת החלטה.\n\n— חשיפות —\n• פרמיה שנתית קיימת: כ-12,000 ש\"ח",
          Action_Items_JSON: "", Source_Event_Id: evtAifion, Account: refA
        },
        {
          id: uid("msum"), Name: "פגישת הכרות ראשונית עם לקוח חדש", Meeting_Date: daysFromNow(-14, 9, 0),
          Short_Summary: "שיחת הכרות ראשונית — הלקוח מעוניין בייעוץ פנסיוני מקיף.",
          Long_Summary: "הלקוח פנה דרך המלצה וביקש לבחון מחדש את מצב הפנסיה וביטוחי המנהלים הקיימים. נקבע להעביר טפסי ייפוי כוח ולתאם פגישת המשך.",
          Action_Items_JSON: JSON.stringify([
            { task: "לשלוח טופס ייפוי כוח ללקוח", owner: "רועי כהן", deadline: "", deadline_text: "" },
            { task: "לתאם פגישת המשך", owner: "רועי כהן", deadline: "", deadline_text: "תוך שבועיים" }
          ])
        }
      ]
    };
  }

  function loadDb() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fall through to reseed */ }
    var seeded = buildSeedDb();
    saveDb(seeded);
    return seeded;
  }

  function saveDb(db) {
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch (e) { /* storage unavailable, run in-memory only */ }
  }

  function resetDb() {
    try { global.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  var db = loadDb();

  // ── LOOKUP RESOLUTION ────────────────────────────────────────
  function displayName(moduleName, rec) {
    if (!rec) return "";
    if (moduleName === "Accounts") return rec.Account_Name || "";
    if (moduleName === "Tasks") return rec.Subject || "";
    if (moduleName === "Events") return rec.Event_Title || rec.Subject || "";
    if (moduleName === "Contacts") return [rec.First_Name, rec.Last_Name].filter(Boolean).join(" ");
    return rec.Name || rec.id;
  }

  function resolveRef(moduleName, id) {
    if (id && typeof id === "object") return id;
    var list = db[moduleName] || [];
    var rec = null;
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { rec = list[i]; break; } }
    return { id: id, name: rec ? displayName(moduleName, rec) : id };
  }

  function withResolvedLookups(entity, rec) {
    var out = Object.assign({}, rec);
    if ((entity === "Tasks" || entity === "Events") && out.What_Id) {
      out.What_Id = resolveRef(out.$se_module || "Accounts", out.What_Id);
    }
    if (entity === "Notes" && out.Parent_Id) {
      out.Parent_Id = resolveRef(out.$se_module || "Accounts", out.Parent_Id);
    }
    if (entity === "Contacts" && out.Account_Name) {
      out.Account_Name = resolveRef("Accounts", out.Account_Name);
    }
    if (entity === "Meeting_Summaries" && out.Account) {
      out.Account = resolveRef("Accounts", out.Account);
    }
    return out;
  }

  // ── QUERY HELPERS ────────────────────────────────────────────
  function paginate(records, args) {
    var page = args.page || 1;
    var perPage = args.per_page || records.length || 1;
    var start = (page - 1) * perPage;
    return records.slice(start, start + perPage);
  }

  function sortRecords(records, sortBy, sortOrder) {
    if (!sortBy) return records;
    var sorted = records.slice().sort(function (a, b) {
      var av = a[sortBy], bv = b[sortBy];
      var an = Date.parse(av), bn = Date.parse(bv);
      var cmp = (!isNaN(an) && !isNaN(bn)) ? an - bn : String(av || "").localeCompare(String(bv || ""));
      return sortOrder === "desc" ? -cmp : cmp;
    });
    return sorted;
  }

  function fieldRefMatches(value, targetId) {
    if (value && typeof value === "object") return value.id === targetId;
    return value === targetId;
  }

  // ── PUBLIC API ───────────────────────────────────────────────
  function getAllRecords(args) {
    var entity = args.Entity;
    var records = (db[entity] || []).map(function (r) { return withResolvedLookups(entity, r); });
    records = sortRecords(records, args.sort_by, args.sort_order);
    return delay({ data: paginate(records, args), status: "success" });
  }

  function getRelatedRecords(args) {
    var relatedList = args.RelatedList;
    var recordId = args.RecordID;
    var entity = (relatedList === "Meetings") ? "Events" : relatedList;
    var records = (db[entity] || []).map(function (r) { return withResolvedLookups(entity, r); });

    if (entity === "Tasks" || entity === "Events") {
      records = records.filter(function (r) { return fieldRefMatches(r.What_Id, recordId); });
    } else if (entity === "Notes") {
      records = records.filter(function (r) { return fieldRefMatches(r.Parent_Id, recordId); });
    } else if (entity === "Contacts") {
      records = records.filter(function (r) { return fieldRefMatches(r.Account_Name, recordId); });
    } else if (entity === "Meeting_Summaries") {
      records = records.filter(function (r) { return fieldRefMatches(r.Account, recordId); });
    }
    records = sortRecords(records, args.sort_by, args.sort_order);
    return delay({ data: paginate(records, args), status: "success" });
  }

  function searchRecords(args) {
    var entity = args.Entity;
    var records = (db[entity] || []).map(function (r) { return withResolvedLookups(entity, r); });

    if (args.Type === "criteria" && args.Query) {
      var m = /\(?\s*([A-Za-z_]+)\s*:\s*equals\s*:\s*([^)]+)\)?/.exec(args.Query);
      if (m) {
        var field = m[1], val = m[2].trim();
        records = records.filter(function (r) { return fieldRefMatches(r[field], val); });
      }
    } else if (args.Type === "word" && args.Query) {
      var q = String(args.Query).toLowerCase();
      records = records.filter(function (r) {
        return Object.keys(r).some(function (k) {
          return typeof r[k] === "string" && r[k].toLowerCase().indexOf(q) !== -1;
        });
      });
    }
    return delay({ data: paginate(records, args), status: "success" });
  }

  function normalizeForInsert(entity, raw) {
    var rec = Object.assign({}, raw);
    rec.id = uid(entity.toLowerCase().slice(0, 4));
    rec.Created_Time = rec.Created_Time || nowIso();
    rec.Modified_Time = nowIso();
    rec.Owner = rec.Owner || { id: "owner_1", name: "רועי כהן" };
    if (entity === "Notes") rec.Created_By = rec.Created_By || rec.Owner;
    if (entity === "Events" && rec.Meeting_Venue__s === "Online" && !rec.$meeting_details) {
      rec.$meeting_details = { joinmeeting_url: "https://teams.microsoft.com/l/meetup-join/mock-" + rec.id };
    }
    return rec;
  }

  function insertRecord(args) {
    var entity = args.Entity;
    var input = Array.isArray(args.APIData) ? args.APIData : [args.APIData];
    db[entity] = db[entity] || [];
    var results = input.map(function (raw) {
      var rec = normalizeForInsert(entity, raw);
      db[entity].push(rec);
      return { code: "SUCCESS", details: { id: rec.id, Modified_Time: rec.Modified_Time }, message: "record added", status: "success" };
    });
    saveDb(db);
    return delay({ data: results });
  }

  function updateRecord(args) {
    var entity = args.Entity;
    var input = Array.isArray(args.APIData) ? args.APIData : [args.APIData];
    var list = db[entity] || [];
    var results = input.map(function (raw) {
      var idx = -1;
      for (var i = 0; i < list.length; i++) { if (list[i].id === raw.id) { idx = i; break; } }
      if (idx === -1) return { code: "RECORD_NOT_FOUND", details: { id: raw.id }, message: "no record with that id", status: "error" };
      list[idx] = Object.assign({}, list[idx], raw, { Modified_Time: nowIso() });
      if (entity === "Events") {
        if (list[idx].Meeting_Venue__s === "Online") {
          if (!list[idx].$meeting_details) {
            list[idx].$meeting_details = { joinmeeting_url: "https://teams.microsoft.com/l/meetup-join/mock-" + list[idx].id };
          }
        } else {
          delete list[idx].$meeting_details;
        }
      }
      return { code: "SUCCESS", details: { id: raw.id, Modified_Time: list[idx].Modified_Time }, message: "record updated", status: "success" };
    });
    saveDb(db);
    return delay({ data: results });
  }

  function getRecord(args) {
    var entity = args.Entity;
    var id = args.RecordID;
    var list = db[entity] || [];
    var rec = null;
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { rec = list[i]; break; } }
    return delay({ data: rec ? [withResolvedLookups(entity, rec)] : [] });
  }

  function deleteRecord(args) {
    var entity = args.Entity;
    var ids = Array.isArray(args.RecordID) ? args.RecordID : [args.RecordID];
    var list = db[entity] || [];
    var results = ids.map(function (id) {
      var idx = -1;
      for (var i = 0; i < list.length; i++) { if (list[i].id === id) { idx = i; break; } }
      if (idx === -1) return { code: "RECORD_NOT_FOUND", details: { id: id }, message: "no record with that id", status: "error" };
      list.splice(idx, 1);
      return { code: "SUCCESS", details: { id: id }, message: "record deleted", status: "success" };
    });
    saveDb(db);
    return delay({ data: results });
  }

  // ── META (field schema) ──────────────────────────────────────
  function pick(values) { return values.map(function (v) { return { actual_value: v, display_value: v }; }); }

  var FIELD_SCHEMAS = {
    Events: [
      { api_name: "Event_Title", field_label: "Event Title", data_type: "text" },
      { api_name: "Start_DateTime", field_label: "Start DateTime", data_type: "datetime" },
      { api_name: "End_DateTime", field_label: "End DateTime", data_type: "datetime" },
      { api_name: "Description", field_label: "Description", data_type: "textarea" },
      { api_name: "Status", field_label: "Status", data_type: "picklist", pick_list_values: pick(["Not Started", "Completed"]) },
      { api_name: "Remind_At", field_label: "Reminder", data_type: "datetime" },
      { api_name: "Meeting_Venue__s", field_label: "Meeting Venue", data_type: "picklist", pick_list_values: pick(["Online", "Offline"]) },
      { api_name: "Meeting_Provider__s", field_label: "Meeting Provider", data_type: "picklist", pick_list_values: pick(["Microsoft Teams", "Zoho Meeting"]) },
      { api_name: "Participants", field_label: "Participants", data_type: "multiselectlookup" },
      { api_name: "What_Id", field_label: "Related To", data_type: "lookup" },
      { api_name: "Imported_Teams_Meeting_Id", field_label: "Imported Teams Meeting Id", data_type: "text" },
      { api_name: "Owner", field_label: "Owner", data_type: "ownerlookup" }
    ],
    Tasks: [
      { api_name: "Subject", field_label: "Subject", data_type: "text" },
      { api_name: "Due_Date", field_label: "Due Date", data_type: "date" },
      { api_name: "Priority", field_label: "Priority", data_type: "picklist", pick_list_values: pick(["Highest", "High", "Normal", "Low", "Lowest"]) },
      { api_name: "Status", field_label: "Status", data_type: "picklist", pick_list_values: pick(["Not Started", "In Progress", "Deferred", "Waiting on someone else", "Completed"]) },
      { api_name: "Description", field_label: "Description", data_type: "textarea" },
      { api_name: "What_Id", field_label: "Related To", data_type: "lookup" },
      { api_name: "Owner", field_label: "Owner", data_type: "ownerlookup" }
    ],
    Accounts: [
      { api_name: "Account_Name", field_label: "Account Name", data_type: "text" },
      { api_name: "Phone", field_label: "Phone", data_type: "phone" },
      { api_name: "Industry", field_label: "Industry", data_type: "picklist", pick_list_values: pick(["ביטוח", "הייטק", "פרטי"]) },
      { api_name: "Website", field_label: "Website", data_type: "website" },
      { api_name: "Account_Number", field_label: "Account Number", data_type: "text" },
      { api_name: "field1", field_label: "אופן חישוב הפרמיה", data_type: "multiselectpicklist", pick_list_values: pick(["אחוז מפרמיה", "אחוז מנכס בסיס"]) },
      { api_name: "field2", field_label: "ממליץ", data_type: "text" },
      { api_name: "field4", field_label: "עמלת ממליץ", data_type: "text" },
      { api_name: "field5", field_label: "גובה העמלה", data_type: "text" },
      { api_name: "field6", field_label: "סטטוס לקוח", data_type: "picklist", pick_list_values: pick(["לקוח פעיל", "לקוח פוטנציאלי", "לקוח לא פעיל"]) },
      { api_name: "Owner", field_label: "Owner", data_type: "ownerlookup" }
    ],
    Notes: [
      { api_name: "Note_Title", field_label: "Title", data_type: "text" },
      { api_name: "Note_Content", field_label: "Content", data_type: "textarea" },
      { api_name: "Parent_Id", field_label: "Related To", data_type: "lookup" }
    ],
    Contacts: [
      { api_name: "First_Name", field_label: "First Name", data_type: "text" },
      { api_name: "Last_Name", field_label: "Last Name", data_type: "text" },
      { api_name: "Mobile", field_label: "Mobile", data_type: "phone" },
      { api_name: "Email", field_label: "Email", data_type: "email" },
      { api_name: "Account_Name", field_label: "Account Name", data_type: "lookup" }
    ],
    Meeting_Summaries: [
      { api_name: "Name", field_label: "Meeting Summary Name", data_type: "text" },
      { api_name: "Meeting_Date", field_label: "Meeting Date", data_type: "datetime" },
      { api_name: "Short_Summary", field_label: "Short Summary", data_type: "text" },
      { api_name: "Long_Summary", field_label: "Long Summary", data_type: "textarea" },
      { api_name: "Action_Items_JSON", field_label: "Action Items JSON", data_type: "textarea" },
      { api_name: "Source_Event_Id", field_label: "Source Event Id", data_type: "text" },
      { api_name: "Account", field_label: "Account", data_type: "lookup" }
    ]
  };

  function getFields(args) {
    return delay({ fields: FIELD_SCHEMAS[args.Entity] || [] });
  }

  // ── CONFIG ────────────────────────────────────────────────────
  function getCurrentUser() {
    return delay({ users: [{ id: "owner_1", full_name: "רועי כהן", email: "mock.user@example.com" }] });
  }

  // ── embeddedApp lifecycle ────────────────────────────────────
  var pageLoadHandlers = [];

  var embeddedApp = {
    on: function (eventName, handler) {
      if (eventName === "PageLoad") pageLoadHandlers.push(handler);
    },
    init: function () {
      return delay(null).then(function () {
        pageLoadHandlers.forEach(function (h) { h(); });
      });
    }
  };

  global.ZOHO = {
    embeddedApp: embeddedApp,
    CRM: {
      API: {
        getAllRecords: getAllRecords,
        getRelatedRecords: getRelatedRecords,
        searchRecords: searchRecords,
        insertRecord: insertRecord,
        updateRecord: updateRecord,
        deleteRecord: deleteRecord,
        getRecord: getRecord
      },
      META: { getFields: getFields },
      CONFIG: { getCurrentUser: getCurrentUser }
    },
    __mock: {
      isMock: true,
      resetAndReload: function () {
        resetDb();
        global.location.reload();
      }
    }
  };

  // ── Visual "mock mode" indicator + reset control ─────────────
  function injectMockUi() {
    var badge = document.createElement("div");
    badge.textContent = "🧪 מצב בדיקה (נתונים מקומיים)";
    badge.setAttribute("style", [
      "position:fixed", "top:0", "left:0", "right:0", "z-index:1000",
      "background:#7a3e00", "color:#fff", "font-family:monospace",
      "font-size:11px", "text-align:center", "padding:3px 0",
      "letter-spacing:.03em"
    ].join(";"));
    document.body.appendChild(badge);
    document.body.style.paddingTop = "20px";

    var resetBtn = document.createElement("button");
    resetBtn.textContent = "🔄 אפס נתוני בדיקה";
    resetBtn.setAttribute("style", [
      "position:fixed", "bottom:14px", "left:150px", "z-index:999",
      "background:#7a3e00", "color:#fff", "border:1px solid #a85a00",
      "border-radius:6px", "padding:5px 12px", "font-size:11px",
      "font-weight:700", "cursor:pointer", "font-family:monospace"
    ].join(";"));
    resetBtn.onclick = function () { global.ZOHO.__mock.resetAndReload(); };
    document.body.appendChild(resetBtn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectMockUi);
  } else {
    injectMockUi();
  }
})(window);
