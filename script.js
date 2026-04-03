// Replace this URL with your deployed Google Apps Script Web App URL.
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzXRLdUaTWDel-vbzVlUFLLZWhJyot64ZiRCzhqpPoa2V3hr75O3UigfGQ_yyepsMbYwA/exec";
const LOGIN_STATUS_KEY = "counsellorLoggedIn";
const LOGIN_TOKEN_KEY = "counsellorSessionToken";

const counsellingForm = document.getElementById("counsellingForm");
const submitButton = document.getElementById("submitButton");
const loadingIndicator = document.getElementById("loadingIndicator");
const formMessage = document.getElementById("formMessage");
const searchMessage = document.getElementById("searchMessage");
const searchButton = document.getElementById("searchButton");
const searchInput = document.getElementById("searchClass");
const resultsBody = document.getElementById("resultsBody");
const loginForm = document.getElementById("loginForm");
const loginCard = document.getElementById("loginCard");
const dashboardSection = document.getElementById("dashboardSection");
const loginMessage = document.getElementById("loginMessage");
const logoutButton = document.getElementById("logoutButton");
const exportButton = document.getElementById("exportButton");
const viewAllButton = document.getElementById("viewAllButton");
const totalStudents = document.getElementById("totalStudents");
const upcomingCount = document.getElementById("upcomingCount");
const overdueCount = document.getElementById("overdueCount");
const reminderList = document.getElementById("reminderList");
let allRecords = [];

// Field names used for form validation and error message mapping.
const fields = [
  "studentName",
  "studentClass",
  "section",
  "concern",
  "counsellingDate",
  "followUpDate"
];

initializePage();

function initializePage() {
  if (counsellingForm) {
    initializeFormPage();
  }

  if (loginForm && dashboardSection) {
    initializeRecordsPage();
  }
}

function initializeFormPage() {
  counsellingForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!validateForm()) {
      showMessage(formMessage, "Please fill in all required fields.", "error");
      return;
    }

    if (!isScriptUrlConfigured()) {
      showMessage(formMessage, "Please add your Google Apps Script Web App URL in script.js.", "error");
      return;
    }

    const formData = {
      studentName: document.getElementById("studentName").value.trim(),
      studentClass: document.getElementById("studentClass").value.trim(),
      section: document.getElementById("section").value.trim(),
      concern: document.getElementById("concern").value.trim(),
      counsellingDate: document.getElementById("counsellingDate").value,
      followUpDate: document.getElementById("followUpDate").value
    };

    setSubmittingState(true);
    clearMessage(formMessage);

    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (result.status === "success") {
        showMessage(formMessage, "Counselling record submitted successfully.", "success");
        counsellingForm.reset();
        clearErrors();
      } else {
        showMessage(formMessage, result.message || "Unable to submit the record.", "error");
      }
    } catch (error) {
      showMessage(formMessage, "Submission failed. Check the Apps Script URL and deployment settings.", "error");
      console.error("Submission error:", error);
    } finally {
      setSubmittingState(false);
    }
  });
}

function initializeRecordsPage() {
  loginForm.addEventListener("submit", handleLogin);
  logoutButton.addEventListener("click", handleLogout);
  searchButton.addEventListener("click", handleSearch);
  viewAllButton.addEventListener("click", function () {
    searchInput.value = "";
    renderTable(allRecords);
    showMessage(searchMessage, `Showing all ${allRecords.length} record(s).`, "info");
  });
  exportButton.addEventListener("click", exportRecordsToExcel);
  searchInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearch();
    }
  });

  if (sessionStorage.getItem(LOGIN_STATUS_KEY) === "true" && getSessionToken()) {
    showDashboard();
    loadDashboardData();
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    showMessage(loginMessage, "Please enter both username and password.", "error");
    return;
  }

  if (!isScriptUrlConfigured()) {
    showMessage(loginMessage, "Please add your Google Apps Script Web App URL in script.js.", "error");
    return;
  }

  showMessage(loginMessage, "Verifying login...", "info");

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "login",
        username: username,
        password: password
      })
    });

    const result = await readJsonResponse(response);

    if (result.status === "success" && result.token) {
      sessionStorage.setItem(LOGIN_STATUS_KEY, "true");
      sessionStorage.setItem(LOGIN_TOKEN_KEY, result.token);
      showMessage(loginMessage, "Login successful. Welcome, counsellor.", "success");
      showDashboard();
      loadDashboardData();
      loginForm.reset();
    } else {
      showMessage(loginMessage, result.message || "Invalid username or password.", "error");
    }
  } catch (error) {
    showMessage(loginMessage, `Login failed: ${error.message}`, "error");
    console.error("Login error:", error);
  }
}

async function handleLogout() {
  const token = getSessionToken();

  if (token && isScriptUrlConfigured()) {
    try {
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "logout",
          token: token
        })
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  sessionStorage.removeItem(LOGIN_STATUS_KEY);
  sessionStorage.removeItem(LOGIN_TOKEN_KEY);
  allRecords = [];
  loginCard.hidden = false;
  dashboardSection.hidden = true;
  renderEmptyRow("Login to load records.");
  reminderList.innerHTML = '<p class="empty-state-block">Login to view reminders.</p>';
  clearMessage(searchMessage);
  showMessage(loginMessage, "You have been logged out.", "info");
}

async function loadDashboardData() {
  if (!isScriptUrlConfigured()) {
    showMessage(searchMessage, "Please add your Google Apps Script Web App URL in script.js.", "error");
    reminderList.innerHTML = '<p class="empty-state-block">Apps Script URL is not configured yet.</p>';
    return;
  }

  showMessage(searchMessage, "Loading dashboard records...", "info");
  renderEmptyRow("Loading records...");

  try {
    const response = await fetch(`${APPS_SCRIPT_URL}?token=${encodeURIComponent(getSessionToken())}`);
    const result = await readJsonResponse(response);

    if (result.status !== "success") {
      if (result.message === "Unauthorized access.") {
        forceLogout("Your session expired. Please login again.");
        return;
      }

      showMessage(searchMessage, result.message || "Unable to load records.", "error");
      renderEmptyRow("No data available.");
      return;
    }

    allRecords = result.data || [];
    updateDashboardStats(allRecords);
    renderReminders(allRecords);
    renderTable(allRecords);
    showMessage(searchMessage, `Showing all ${allRecords.length} record(s).`, "success");
  } catch (error) {
    showMessage(searchMessage, "Unable to load dashboard data.", "error");
    renderEmptyRow("Unable to load records.");
    reminderList.innerHTML = '<p class="empty-state-block">Unable to load reminders.</p>';
    console.error("Dashboard load error:", error);
  }
}

async function handleSearch() {
  const classValue = searchInput.value.trim();

  if (!classValue) {
    showMessage(searchMessage, "Please enter a class to search.", "error");
    return;
  }

  if (!isScriptUrlConfigured()) {
    showMessage(searchMessage, "Please add your Google Apps Script Web App URL in script.js.", "error");
    return;
  }

  showMessage(searchMessage, "Searching records...", "info");
  renderEmptyRow("Loading records...");

  try {
    const response = await fetch(`${APPS_SCRIPT_URL}?class=${encodeURIComponent(classValue)}&token=${encodeURIComponent(getSessionToken())}`);
    const result = await readJsonResponse(response);

    if (result.status !== "success") {
      if (result.message === "Unauthorized access.") {
        forceLogout("Your session expired. Please login again.");
        return;
      }

      showMessage(searchMessage, result.message || "Unable to fetch records.", "error");
      renderEmptyRow("No data available.");
      return;
    }

    renderTable(result.data || []);

    if ((result.data || []).length === 0) {
      showMessage(searchMessage, `No records found for class ${classValue}.`, "info");
    } else {
      showMessage(searchMessage, `Found ${result.data.length} record(s) for class ${classValue}.`, "success");
    }
  } catch (error) {
    showMessage(searchMessage, "Search failed. Check the Apps Script URL and sharing settings.", "error");
    renderEmptyRow("Unable to load records.");
    console.error("Search error:", error);
  }
}

// Validate form and show field-level messages.
function validateForm() {
  let isValid = true;

  fields.forEach(function (fieldId) {
    const input = document.getElementById(fieldId);
    const errorElement = document.getElementById(`${fieldId}Error`);

    if (!input.value.trim()) {
      errorElement.textContent = "This field is required.";
      isValid = false;
    } else {
      errorElement.textContent = "";
    }
  });

  return isValid;
}

function clearErrors() {
  fields.forEach(function (fieldId) {
    document.getElementById(`${fieldId}Error`).textContent = "";
  });
}

function setSubmittingState(isSubmitting) {
  submitButton.disabled = isSubmitting;
  loadingIndicator.classList.toggle("visible", isSubmitting);
  submitButton.textContent = isSubmitting ? "Submitting..." : "Submit Record";
}

function renderTable(records) {
  if (records.length === 0) {
    renderEmptyRow("No records found.");
    return;
  }

  resultsBody.innerHTML = records.map(function (record) {
    return `
      <tr>
        <td>${escapeHtml(record.studentName)}</td>
        <td>${escapeHtml(record.studentClass)}</td>
        <td>${escapeHtml(record.section)}</td>
        <td>${escapeHtml(record.concern)}</td>
        <td>${formatDate(record.counsellingDate)}</td>
        <td>${formatDate(record.followUpDate)}</td>
      </tr>
    `;
  }).join("");
}

function renderEmptyRow(message) {
  if (!resultsBody) {
    return;
  }

  resultsBody.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(message)}</td></tr>`;
}

function showMessage(element, message, type) {
  element.className = `message ${type}`;
  element.textContent = message;
}

function clearMessage(element) {
  element.className = "message";
  element.textContent = "";
}

function isScriptUrlConfigured() {
  return APPS_SCRIPT_URL && !APPS_SCRIPT_URL.includes("PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE");
}

async function readJsonResponse(response) {
  const rawText = await response.text();

  try {
    return JSON.parse(rawText);
  } catch (error) {
    const cleanedText = rawText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    throw new Error(cleanedText || `Unexpected response with status ${response.status}`);
  }
}

function getSessionToken() {
  return sessionStorage.getItem(LOGIN_TOKEN_KEY) || "";
}

function showDashboard() {
  loginCard.hidden = true;
  dashboardSection.hidden = false;
}

function forceLogout(message) {
  sessionStorage.removeItem(LOGIN_STATUS_KEY);
  sessionStorage.removeItem(LOGIN_TOKEN_KEY);
  allRecords = [];
  loginCard.hidden = false;
  dashboardSection.hidden = true;
  renderEmptyRow("Login to load records.");
  reminderList.innerHTML = '<p class="empty-state-block">Login to view reminders.</p>';
  showMessage(loginMessage, message, "error");
  clearMessage(searchMessage);
}

function updateDashboardStats(records) {
  totalStudents.textContent = records.length;

  const followUpSummary = summarizeFollowUps(records);
  upcomingCount.textContent = followUpSummary.upcoming.length;
  overdueCount.textContent = followUpSummary.overdue.length;
}

function renderReminders(records) {
  const followUpSummary = summarizeFollowUps(records);
  const reminders = followUpSummary.overdue.concat(followUpSummary.upcoming);

  if (reminders.length === 0) {
    reminderList.innerHTML = '<p class="empty-state-block">No follow-ups due in the next 7 days.</p>';
    return;
  }

  reminderList.innerHTML = reminders.map(function (record) {
    const isOverdue = isPastDate(record.followUpDate);
    return `
      <article class="reminder-item ${isOverdue ? "reminder-item--overdue" : ""}">
        <strong>${escapeHtml(record.studentName)}</strong> - Class ${escapeHtml(record.studentClass)} ${escapeHtml(record.section)}
        <p>
          Follow-up date: ${formatDate(record.followUpDate)}<br>
          Concern: ${escapeHtml(record.concern)}
        </p>
      </article>
    `;
  }).join("");
}

function summarizeFollowUps(records) {
  const today = getStartOfDay(new Date());
  const nextSevenDays = new Date(today);
  nextSevenDays.setDate(nextSevenDays.getDate() + 7);

  const overdue = [];
  const upcoming = [];

  records.forEach(function (record) {
    if (!record.followUpDate) {
      return;
    }

    const followUpDate = getStartOfDay(new Date(record.followUpDate));

    if (Number.isNaN(followUpDate.getTime())) {
      return;
    }

    if (followUpDate < today) {
      overdue.push(record);
    } else if (followUpDate <= nextSevenDays) {
      upcoming.push(record);
    }
  });

  return { overdue, upcoming };
}

function isPastDate(dateString) {
  const followUpDate = getStartOfDay(new Date(dateString));
  const today = getStartOfDay(new Date());

  if (Number.isNaN(followUpDate.getTime())) {
    return false;
  }

  return followUpDate < today;
}

function getStartOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function exportRecordsToExcel() {
  if (!allRecords.length) {
    showMessage(searchMessage, "No records available to export.", "error");
    return;
  }

  const rows = [
    ["Student Name", "Class", "Section", "Concern", "Counselling Date", "Follow-up Date", "Timestamp"]
  ].concat(allRecords.map(function (record) {
    return [
      record.studentName,
      record.studentClass,
      record.section,
      record.concern,
      formatDate(record.counsellingDate),
      formatDate(record.followUpDate),
      formatDate(record.timestamp)
    ];
  }));

  const csvContent = rows.map(function (row) {
    return row.map(function (value) {
      return `"${String(value || "").replace(/"/g, '""')}"`;
    }).join(",");
  }).join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "student-counselling-records.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showMessage(searchMessage, "Excel export downloaded successfully.", "success");
}

function formatDate(dateString) {
  if (!dateString) {
    return "-";
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

// Escape HTML characters before showing user data in the table.
function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
