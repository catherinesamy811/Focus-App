(() => {
  "use strict";

  const STORAGE_KEY = "focus-productivity-state-v3";

  const SUPABASE_URL = "https://rdzzmupxwofotnkmalxl.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkenptdXB4d29mb3Rua21hbHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MjY0MDMsImV4cCI6MjA5NTEwMjQwM30.3IfN0tHzB7VFQm5v-ZjwJ_NxPrX3z-tKbXFhqz9BW08";
  const sb = (typeof globalThis.supabase !== "undefined" && SUPABASE_URL.startsWith("https://"))
    ? globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null;

  const legacyStorageKeys = [
    "orbit-productivity-state-v2",
    "orbit-productivity-state-v1",
  ];

  const weekdays = [
    { id: "mon", label: "Mon" },
    { id: "tue", label: "Tue" },
    { id: "wed", label: "Wed" },
    { id: "thu", label: "Thu" },
    { id: "fri", label: "Fri" },
    { id: "sat", label: "Sat" },
    { id: "sun", label: "Sun" },
  ];

  const themes = {
    slate: {
      label: "Ivory",
      bg: "#F5F3EF",
      strong: "#1A1410",
      accent: "#6B1D3A",
      accent2: "#9B3558",
      soft: "rgba(107, 29, 58, 0.06)",
    },
    navy: {
      label: "Navy",
      bg: "#f3f6fb",
      strong: "#101c30",
      accent: "#355c8c",
      accent2: "#5e7da8",
      soft: "rgba(53, 92, 140, 0.14)",
    },
    graphite: {
      label: "Charcoal",
      bg: "#f5f5f4",
      strong: "#171717",
      accent: "#4b5563",
      accent2: "#6b7280",
      soft: "rgba(75, 85, 99, 0.13)",
    },
    forest: {
      label: "Forest",
      bg: "#f3f7f3",
      strong: "#13251d",
      accent: "#3d5f4d",
      accent2: "#6f8b7d",
      soft: "rgba(61, 95, 77, 0.13)",
    },
    sand: {
      label: "Sand",
      bg: "#f8f6f3",
      strong: "#1f1a15",
      accent: "#6d6257",
      accent2: "#94887a",
      soft: "rgba(109, 98, 87, 0.14)",
    },
    rose: {
      label: "Rose",
      bg: "#f7f4f6",
      strong: "#1f1a1d",
      accent: "#8a6678",
      accent2: "#a58a98",
      soft: "rgba(138, 102, 120, 0.13)",
    },
    pink: {
      label: "Power Pink",
      bg: "#fdf5f8",
      strong: "#200d18",
      accent: "#bf1660",
      accent2: "#e84c8c",
      soft: "rgba(191, 22, 96, 0.12)",
    },
    maroon: {
      label: "Garnet",
      bg: "#faf4f5",
      strong: "#1a060f",
      accent: "#7c1535",
      accent2: "#b5254c",
      soft: "rgba(124, 21, 53, 0.12)",
    },
  };

  const seedCategories = [
    { id: "work", name: "Work", color: "#38bdf8" },
    { id: "health", name: "Health", color: "#22c55e" },
    { id: "home", name: "Home", color: "#fb923c" },
    { id: "joy", name: "Joy", color: "#7a8ea8" },
  ];

  const dom = {};
  let state;
  let pendingDates = [];
  let editingTaskId = null;
  let editPendingDates = [];
  let dragState = null;
  let calendarInstance = null;
  let currentUser = null;
  let syncTimer = null;
  let appStarted = false;
  let appStarting = false;
  let eventsBound = false;

  function makeId(prefix = "id") {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function todayKey() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  }

  function currentWeekdayId() {
    const dayIndex = new Date().getDay();
    return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dayIndex];
  }

  function createDefaultState() {
    const today = todayKey();

    return {
      theme: "slate",
      activeFilter: "all",
      selectedPlannerCategory: "all",
      categories: clone(seedCategories),
      quote: "The question isn't who is going to let me -- it's who is going to stop me.",
      tasks: [
        { id: makeId("task"), title: "Plan tomorrow's top three", categoryId: "work", period: "daily", days: [], done: false },
        { id: makeId("task"), title: "Reset desk and water bottle", categoryId: "home", period: "daily", days: [], done: true },
        { id: makeId("task"), title: "Review weekly priorities", categoryId: "work", period: "weekly", days: ["mon"], done: false },
      ],
      habits: [
        { id: makeId("habit"), title: "Read 10 pages", categoryId: "joy", checks: { [today]: true } },
        { id: makeId("habit"), title: "Move for 20 minutes", categoryId: "health", checks: {} },
      ],
      plans: {},
      brainstorm: "",
      calendarEvents: [],
      dashboardOrder: [],
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function readStorage() {
    try {
      return localStorage.getItem(STORAGE_KEY) || legacyStorageKeys.map((key) => localStorage.getItem(key)).find(Boolean);
    } catch {
      return null;
    }
  }

  function writeStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      showStorageWarning();
    }
    scheduleSyncToSupabase();
  }

  function scheduleSyncToSupabase() {
    if (!sb || !currentUser) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncToSupabase, 1500);
  }

  async function syncToSupabase() {
    if (!sb || !currentUser) return;
    try {
      await sb.from("user_state").upsert(
        { user_id: currentUser.id, state: state },
        { onConflict: "user_id" }
      );
    } catch (err) {
      console.warn("Supabase sync failed:", err);
    }
  }

  async function loadFromSupabase() {
    if (!sb || !currentUser) return "skipped";
    try {
      const { data, error } = await sb
        .from("user_state")
        .select("state")
        .eq("user_id", currentUser.id)
        .single();

      if (error) {
        // PGRST116 = PostgREST "0 rows returned" — this user has no record yet
        if (error.code === "PGRST116") return "not_found";
        log("Supabase load error:", error.message || error);
        return "error";
      }

      if (!data || !data.state) return "not_found";

      const fallback = createDefaultState();
      state = normalizeState({ ...fallback, ...data.state }, fallback);
      state._userId = currentUser.id;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
      return "loaded";
    } catch (err) {
      log("Supabase load exception:", err);
      return "error";
    }
  }

  function subscribeToChanges() {
    if (!sb || !currentUser) return;
    const userId = currentUser.id;
    sb.channel("state-sync")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "user_state",
        filter: `user_id=eq.${userId}`,
      }, function(payload) {
        if (!payload.new || !payload.new.state) return;
        if (payload.new.user_id && payload.new.user_id !== userId) return;
        const fallback = createDefaultState();
        state = normalizeState({ ...fallback, ...payload.new.state }, fallback);
        state._userId = userId;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
        renderAll();
        renderBrainstorm();
      })
      .subscribe();
  }

  function loadState() {
    const fallback = createDefaultState();
    const saved = readStorage();

    if (!saved) return fallback;

    try {
      return normalizeState({ ...fallback, ...JSON.parse(saved) }, fallback);
    } catch {
      return fallback;
    }
  }

  function normalizeState(input, fallback) {
    const categories = Array.isArray(input.categories)
      ? input.categories.map(normalizeCategory).filter(Boolean)
      : fallback.categories;

    const safeCategories = categories.length ? categories : fallback.categories;
    const categoryIds = new Set(safeCategories.map((category) => category.id));
    const firstCategoryId = safeCategories[0].id;

    const tasks = Array.isArray(input.tasks)
      ? input.tasks.map((task) => normalizeTask(task, categoryIds, firstCategoryId)).filter(Boolean)
      : fallback.tasks;

    const habits = Array.isArray(input.habits)
      ? input.habits.map((habit) => normalizeHabit(habit, categoryIds, firstCategoryId)).filter(Boolean)
      : fallback.habits;

    const selectedPlannerCategory = input.selectedPlannerCategory === "all" || categoryIds.has(input.selectedPlannerCategory)
      ? input.selectedPlannerCategory
      : "all";

    const activeFilter = isValidFilter(input.activeFilter, categoryIds) ? input.activeFilter : "all";

    return {
      theme: themes[input.theme] ? input.theme : fallback.theme,
      activeFilter,
      selectedPlannerCategory,
      categories: safeCategories,
      tasks,
      habits,
      plans: input.plans && typeof input.plans === "object" && !Array.isArray(input.plans) ? input.plans : {},
      quote: typeof input.quote === "string" ? input.quote : fallback.quote,
      brainstorm: typeof input.brainstorm === "string" ? input.brainstorm : "",
      calendarEvents: Array.isArray(input.calendarEvents)
        ? input.calendarEvents.map(normalizeCalendarEvent).filter(Boolean)
        : [],
      dashboardOrder: Array.isArray(input.dashboardOrder)
        ? input.dashboardOrder.filter((id) => typeof id === "string")
        : [],
      _userId: typeof input._userId === "string" ? input._userId : null,
    };
  }

  function normalizeCategory(category) {
    if (!category || typeof category !== "object") return null;

    const name = String(category.name || "").trim();
    if (!name) return null;

    return {
      id: slugify(category.id || name),
      name,
      color: normalizeColor(category.color),
    };
  }

  function normalizeTask(task, categoryIds, fallbackCategoryId) {
    if (!task || typeof task !== "object") return null;

    const title = String(task.title || "").trim();
    if (!title) return null;

    const period = ["daily", "weekly", "monthly", "specific"].includes(task.period) ? task.period : "daily";
    const categoryId = categoryIds.has(task.categoryId) ? task.categoryId : fallbackCategoryId;

    return {
      id: String(task.id || makeId("task")),
      title,
      categoryId,
      period,
      days: period === "weekly" ? normalizeDays(task.days) : [],
      dates: period === "specific" ? normalizeDates(task.dates) : [],
      priority: ["high", "normal"].includes(task.priority) ? task.priority : "normal",
      done: Boolean(task.done),
    };
  }

  function normalizeCalendarEvent(ev) {
    if (!ev || typeof ev !== "object") return null;
    const title = String(ev.title || "").trim();
    if (!title || !ev.start || !ev.end) return null;
    return {
      id: String(ev.id || makeId("block")),
      title,
      categoryId: String(ev.categoryId || ""),
      start: String(ev.start),
      end: String(ev.end),
    };
  }

  function normalizeDays(days) {
    const validDays = new Set(weekdays.map((day) => day.id));
    if (!Array.isArray(days)) return [];
    return days.filter((day, index) => validDays.has(day) && days.indexOf(day) === index);
  }

  function normalizeDates(dates) {
    if (!Array.isArray(dates)) return [];
    return dates.filter((d, i) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && dates.indexOf(d) === i);
  }

  function getStreak(habit) {
    let streak = 0;
    const now = new Date();
    for (let i = 0; i < 366; i++) {
      const d = new Date(now.getTime() - i * 86400000);
      const offset = d.getTimezoneOffset() * 60000;
      const key = new Date(d.getTime() - offset).toISOString().slice(0, 10);
      if (!habit.checks || !habit.checks[key]) break;
      streak++;
    }
    return streak;
  }

  function isOverdue(task) {
    if (task.done || task.period !== "specific") return false;
    if (!task.dates || task.dates.length === 0) return false;
    return task.dates.every((d) => d < todayKey());
  }

  function normalizeHabit(habit, categoryIds, fallbackCategoryId) {
    if (!habit || typeof habit !== "object") return null;

    const title = String(habit.title || "").trim();
    if (!title) return null;

    const categoryId = categoryIds.has(habit.categoryId) ? habit.categoryId : fallbackCategoryId;
    const checks = habit.checks && typeof habit.checks === "object" && !Array.isArray(habit.checks) ? habit.checks : {};

    return {
      id: String(habit.id || makeId("habit")),
      title,
      categoryId,
      checks,
    };
  }

  function normalizeColor(color) {
    const value = String(color || "").trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value : "#4f6a8a";
  }

  function slugify(value) {
    const slug = String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return slug || makeId("category");
  }

  function isValidFilter(filter, categoryIds) {
    return ["all", "daily", "weekly", "monthly", "specific"].includes(filter) || categoryIds.has(filter);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[char]);
  }

  function log(...args) {
    // eslint-disable-next-line no-console
    console.log("[Focus]", ...args);
  }

  function showLoadingOverlay() {
    const el = document.getElementById("loading-overlay");
    if (el) el.hidden = false;
  }

  function hideLoadingOverlay() {
    const el = document.getElementById("loading-overlay");
    if (el) el.hidden = true;
  }

  function cleanLegacyStorage() {
    const obsolete = [
      ...legacyStorageKeys,
      "focus-productivity-state-v1",
      "focus-productivity-state-v2",
    ];
    obsolete.forEach(function(key) {
      try { localStorage.removeItem(key); } catch {}
    });
  }

  function categoryById(id) {
    return state.categories.find((category) => category.id === id) || state.categories[0];
  }

  function cacheDom() {
    Object.assign(dom, {
      currentDate: document.querySelector("#current-date"),
      completionRate: document.querySelector("#completion-rate"),
      habitCount: document.querySelector("#habit-count"),
      focusCount: document.querySelector("#focus-count"),
      todayTaskCount: document.querySelector("#today-task-count"),
      todayTaskList: document.querySelector("#today-task-list"),
      taskForm: document.querySelector("#task-form"),
      taskTitle: document.querySelector("#task-title"),
      taskCategory: document.querySelector("#task-category"),
      taskPeriod: document.querySelector("#task-period"),
      taskWeekdays: document.querySelector("#task-weekdays"),
      taskFilters: document.querySelector("#task-filters"),
      taskList: document.querySelector("#task-list"),
      habitForm: document.querySelector("#habit-form"),
      habitTitle: document.querySelector("#habit-title"),
      habitCategory: document.querySelector("#habit-category"),
      habitList: document.querySelector("#habit-list"),
      plannerCategory: document.querySelector("#planner-category"),
      plannerCards: [...document.querySelectorAll(".planner-card")],
      categoryForm: document.querySelector("#category-form"),
      categoryName: document.querySelector("#category-name"),
      categoryColor: document.querySelector("#category-color"),
      categoryList: document.querySelector("#category-list"),
      themeGrid: document.querySelector("#theme-grid"),
      clearCompleted: document.querySelector("#clear-completed"),
      emptyTemplate: document.querySelector("#empty-state-template"),
      dashboardQuote: document.querySelector("#dashboard-quote"),
      quoteForm: document.querySelector("#quote-form"),
      quoteInput: document.querySelector("#quote-input"),
      taskDatePicker: document.querySelector("#task-date-picker"),
      taskDateInput: document.querySelector("#task-date-input"),
      taskDateAddBtn: document.querySelector("#task-date-add-btn"),
      taskDateChips: document.querySelector("#task-date-chips"),
      taskPriority: document.querySelector("#task-priority"),
      brainstormForm: document.querySelector("#brainstorm-form"),
      brainstormText: document.querySelector("#brainstorm-text"),
      brainstormClear: document.querySelector("#brainstorm-clear"),
      blockForm: document.querySelector("#block-form"),
      blockTitle: document.querySelector("#block-title"),
      blockCategory: document.querySelector("#block-category"),
      blockDate: document.querySelector("#block-date"),
      blockStart: document.querySelector("#block-start"),
      blockEnd: document.querySelector("#block-end"),
      calendarEl: document.querySelector("#focus-calendar"),
      taskDrawer: document.querySelector("#task-drawer"),
      taskDrawerBody: document.querySelector("#task-drawer-body"),
      taskDrawerClose: document.querySelector("#task-drawer-close"),
      taskDrawerBackdrop: document.querySelector(".task-drawer-backdrop"),
    });
  }

  function requiredDomExists() {
    return Object.entries(dom).every(([, value]) => Boolean(value));
  }

  function applyTheme() {
    const theme = themes[state.theme] || themes.slate;
    const root = document.documentElement;
    root.style.setProperty("--bg", theme.bg);
    root.style.setProperty("--bg-strong", theme.strong);
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--accent-2", theme.accent2);
    root.style.setProperty("--accent-soft", theme.soft);
  }

  function syncCategorySelects() {
    const options = state.categories
      .map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`)
      .join("");

    dom.taskCategory.innerHTML = options;
    dom.habitCategory.innerHTML = options;
    dom.plannerCategory.innerHTML = `<option value="all">All categories</option>${options}`;
    if (dom.blockCategory) dom.blockCategory.innerHTML = options;
    dom.plannerCategory.value = state.selectedPlannerCategory;
  }

  function renderStats() {
    const todayTasks = tasksForToday();
    const todayDone = todayTasks.filter((task) => task.done).length;
    const todayOpen = todayTasks.filter((task) => !task.done).length;
    const today = todayKey();
    const habitsDone = state.habits.filter((h) => h.checks && h.checks[today]).length;
    const completion = todayTasks.length ? Math.round((todayDone / todayTasks.length) * 100) : 0;

    dom.completionRate.textContent = `${completion}%`;
    dom.habitCount.textContent = `${habitsDone}/${state.habits.length}`;
    dom.focusCount.textContent = `${todayOpen} priorities`;
  }

  function tasksForToday() {
    const weekday = currentWeekdayId();
    const today = todayKey();

    return state.tasks.filter((task) => {
      if (task.period === "daily") return true;
      if (task.period === "weekly") return task.days.includes(weekday);
      if (task.period === "specific") return Array.isArray(task.dates) && task.dates.includes(today);
      return false;
    });
  }

  function renderFilters() {
    const filters = [
      { id: "all", name: "All" },
      { id: "daily", name: "Daily" },
      { id: "weekly", name: "Weekly" },
      { id: "monthly", name: "Monthly" },
      { id: "specific", name: "Specific" },
      ...state.categories,
    ];

    dom.taskFilters.innerHTML = filters
      .map((filter) => {
        const active = state.activeFilter === filter.id ? "active" : "";
        return `<button class="filter-chip ${active}" type="button" data-filter="${escapeHtml(filter.id)}">${escapeHtml(filter.name)}</button>`;
      })
      .join("");
  }

  function renderTasks() {
    const tasks = state.tasks.filter((task) => {
      if (state.activeFilter === "all") return true;
      return task.period === state.activeFilter || task.categoryId === state.activeFilter;
    });

    dom.taskList.innerHTML = tasks.length
      ? tasks.map((t) => renderTask(t, "tasks")).join("")
      : emptyState("Nothing in motion.", "Every decisive move starts here.");
  }

  function renderTodayTasks() {
    const tasks = sortedDashboardTasks(tasksForToday());
    const openCount = tasks.filter((task) => !task.done).length;

    dom.todayTaskCount.textContent = `${openCount} open`;
    dom.todayTaskList.innerHTML = tasks.length
      ? tasks.map((t) => renderTask(t, "dashboard")).join("")
      : emptyState("A clear field.", "No priorities claimed for today. Set your first move.");
  }

  function sortedDashboardTasks(tasks) {
    const order = state.dashboardOrder || [];
    const ordered = order.map((id) => tasks.find((t) => t.id === id)).filter(Boolean);
    const unordered = tasks.filter((t) => !order.includes(t.id));
    return [...ordered, ...unordered];
  }

  function renderTask(task, context) {
    const category = categoryById(task.categoryId);
    const isDashboard = context === "dashboard";
    const isTasksPage = context === "tasks";

    const dragHandle = isDashboard
      ? `<button class="drag-handle" type="button" data-drag-task="${escapeHtml(task.id)}" aria-label="Drag to reorder"><span>⋮</span><span>⋮</span></button>`
      : "";

    const editBtn = isTasksPage
      ? `<button class="icon-button task-edit-icon" type="button" data-edit-task="${escapeHtml(task.id)}" aria-label="Edit task"></button>`
      : "";

    return `
      <article class="task-item ${task.done ? "done" : ""} ${task.priority === "high" ? "high-priority" : ""} ${isOverdue(task) ? "overdue" : ""}" data-task-id="${escapeHtml(task.id)}">
        ${dragHandle}
        <div class="task-left">
          <input class="task-check" type="checkbox" data-task-toggle="${escapeHtml(task.id)}" ${task.done ? "checked" : ""} />
          <div>
            <span class="task-title">${escapeHtml(task.title)}</span>
            <span class="meta-line">
              <span class="tag" style="--tag-color: ${escapeHtml(category.color)}">${escapeHtml(category.name)}</span>
              ${task.period !== "specific" ? `<span>${escapeHtml(task.period.charAt(0).toUpperCase() + task.period.slice(1))}</span>` : ""}
              ${task.period === "weekly" && task.days.length ? `<span>${escapeHtml(formatDays(task.days))}</span>` : ""}
              ${task.period === "specific" && task.dates && task.dates.length ? `<span>${escapeHtml(formatDates(task.dates))}</span>` : ""}
              ${isOverdue(task) ? `<span class="overdue-badge">Overdue</span>` : ""}
            </span>
          </div>
        </div>
        <div class="task-item-actions">
          ${editBtn}
          <button class="icon-button" type="button" data-delete-task="${escapeHtml(task.id)}" aria-label="Delete task">x</button>
        </div>
      </article>
    `;
  }

  function renderHabits() {
    const today = todayKey();

    dom.habitList.innerHTML = state.habits.length
      ? state.habits.map((habit) => renderHabit(habit, today)).join("")
      : emptyState("No patterns built yet.", "Discipline is built one rep at a time. Start yours.");
  }

  function formatDays(days) {
    const labels = new Map(weekdays.map((day) => [day.id, day.label]));
    return days.map((day) => labels.get(day)).filter(Boolean).join(", ");
  }

  function formatDates(dates) {
    return dates.map((d) => {
      const [year, month, day] = d.split("-").map(Number);
      return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
    }).join(", ");
  }

  function renderHabit(habit, today) {
    const category = categoryById(habit.categoryId);
    const checked = Boolean(habit.checks && habit.checks[today]);
    const streak = getStreak(habit);
    const streakLabel = streak > 0 ? `${streak} day${streak !== 1 ? "s" : ""} streak` : "Start your streak";

    return `
      <article class="habit-item">
        <div class="habit-left">
          <input class="habit-check" type="checkbox" data-habit-toggle="${escapeHtml(habit.id)}" ${checked ? "checked" : ""} />
          <div>
            <strong>${escapeHtml(habit.title)}</strong>
            <span class="meta-line">
              <span class="tag" style="--tag-color: ${escapeHtml(category.color)}">${escapeHtml(category.name)}</span>
              <span class="habit-streak ${streak === 0 ? "habit-streak--none" : ""}">${escapeHtml(streakLabel)}</span>
            </span>
          </div>
        </div>
        <button class="icon-button" type="button" data-delete-habit="${escapeHtml(habit.id)}" aria-label="Delete habit">x</button>
      </article>
    `;
  }

  function renderCategories() {
    dom.categoryList.innerHTML = state.categories
      .map((category) => `
        <span class="category-pill">
          <span class="swatch" style="--swatch: ${escapeHtml(category.color)}"></span>
          ${escapeHtml(category.name)}
          <button class="icon-button" type="button" data-delete-category="${escapeHtml(category.id)}" aria-label="Delete category">x</button>
        </span>
      `)
      .join("");
  }

  function renderThemes() {
    dom.themeGrid.innerHTML = Object.entries(themes)
      .map(([id, theme]) => `
        <button class="theme-button" type="button" data-theme="${escapeHtml(id)}" style="--preview-a: ${theme.accent}; --preview-b: ${theme.accent2}" aria-pressed="${state.theme === id}">
          <span></span>
          ${escapeHtml(theme.label)}${state.theme === id ? " selected" : ""}
        </button>
      `)
      .join("");
  }

  function plannerKey(period) {
    return `${state.selectedPlannerCategory}:${period}`;
  }

  function renderPlanner() {
    dom.plannerCards.forEach((card) => {
      const textarea = card.querySelector("textarea");
      if (!textarea) return;
      textarea.value = state.plans[plannerKey(card.dataset.period)] || "";
    });
  }

  function emptyState(title, message) {
    return `
      <div class="empty-state">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }

  function renderQuote() {
    const text = (state.quote || "").trim();
    dom.dashboardQuote.textContent = text;
    dom.quoteInput.value = text;
  }

  function saveQuote(event) {
    event.preventDefault();
    state.quote = dom.quoteInput.value.trim();
    writeStorage();
    renderQuote();
  }

  function renderAll() {
    applyTheme();
    syncCategorySelects();
    renderStats();
    renderFilters();
    renderTodayTasks();
    renderTasks();
    renderHabits();
    renderCategories();
    renderThemes();
    renderPlanner();
    renderQuote();
    toggleWeekdayPicker();
    renderCalendar();
  }

  function addTask(event) {
    event.preventDefault();

    const title = dom.taskTitle.value.trim();
    if (!title) return;

    const period = dom.taskPeriod.value || "daily";
    if (period === "specific" && pendingDates.length === 0) return;

    state.tasks.unshift({
      id: makeId("task"),
      title,
      categoryId: dom.taskCategory.value || state.categories[0].id,
      period,
      days: period === "weekly" ? selectedTaskDays() : [],
      dates: period === "specific" ? [...pendingDates] : [],
      priority: dom.taskPriority.checked ? "high" : "normal",
      done: false,
    });

    dom.taskTitle.value = "";
    dom.taskPriority.checked = false;
    clearTaskDays();
    writeStorage();
    renderAll();
  }

  function addHabit(event) {
    event.preventDefault();

    const title = dom.habitTitle.value.trim();
    if (!title) return;

    state.habits.unshift({
      id: makeId("habit"),
      title,
      categoryId: dom.habitCategory.value || state.categories[0].id,
      checks: {},
    });

    dom.habitTitle.value = "";
    writeStorage();
    renderAll();
  }

  function addCategory(event) {
    event.preventDefault();

    const name = dom.categoryName.value.trim();
    if (!name) return;

    const baseId = slugify(name);
    const existingIds = new Set(state.categories.map((category) => category.id));
    let id = baseId;
    let suffix = 2;

    while (existingIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    state.categories.push({
      id,
      name,
      color: normalizeColor(dom.categoryColor.value),
    });

    dom.categoryName.value = "";
    writeStorage();
    renderAll();
  }

  function handleDocumentClick(event) {
    const target = event.target;
    let changed = false;

    if (!(target instanceof Element)) return;

    const removeDateButton = target.closest("[data-remove-date]");
    if (removeDateButton) {
      pendingDates = pendingDates.filter((d) => d !== removeDateButton.dataset.removeDate);
      renderDateChips();
      return;
    }

    const drawerRemoveDateButton = target.closest("[data-drawer-remove-date]");
    if (drawerRemoveDateButton) {
      editPendingDates = editPendingDates.filter((d) => d !== drawerRemoveDateButton.dataset.drawerRemoveDate);
      renderDrawerDateChips();
      return;
    }

    const editTaskButton = target.closest("[data-edit-task]");
    if (editTaskButton) {
      openTaskDrawer(editTaskButton.dataset.editTask);
      return;
    }

    const filterButton = target.closest("[data-filter]");
    const taskDeleteButton = target.closest("[data-delete-task]");
    const habitDeleteButton = target.closest("[data-delete-habit]");
    const categoryDeleteButton = target.closest("[data-delete-category]");
    const themeButton = target.closest("[data-theme]");

    if (filterButton) {
      state.activeFilter = filterButton.dataset.filter || "all";
      changed = true;
    } else if (taskDeleteButton) {
      state.tasks = state.tasks.filter((task) => task.id !== taskDeleteButton.dataset.deleteTask);
      changed = true;
    } else if (habitDeleteButton) {
      state.habits = state.habits.filter((habit) => habit.id !== habitDeleteButton.dataset.deleteHabit);
      changed = true;
    } else if (categoryDeleteButton) {
      changed = deleteCategory(categoryDeleteButton.dataset.deleteCategory);
    } else if (themeButton) {
      state.theme = themes[themeButton.dataset.theme] ? themeButton.dataset.theme : "slate";
      changed = true;
    }

    if (changed) {
      writeStorage();
      renderAll();
    }
  }

  function deleteCategory(id) {
    if (!id || state.categories.length <= 1) return false;

    const nextCategories = state.categories.filter((category) => category.id !== id);
    if (nextCategories.length === state.categories.length) return false;

    const replacementId = nextCategories[0].id;
    state.categories = nextCategories;
    state.tasks = state.tasks.map((task) => task.categoryId === id ? { ...task, categoryId: replacementId } : task);
    state.habits = state.habits.map((habit) => habit.categoryId === id ? { ...habit, categoryId: replacementId } : habit);

    if (state.activeFilter === id) state.activeFilter = "all";
    if (state.selectedPlannerCategory === id) state.selectedPlannerCategory = "all";

    return true;
  }

  function handleDocumentChange(event) {
    const target = event.target;
    let changed = false;

    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

    if (target.matches("[data-task-toggle]")) {
      state.tasks = state.tasks.map((task) =>
        task.id === target.dataset.taskToggle ? { ...task, done: target.checked } : task,
      );
      changed = true;
    } else if (target.matches("[data-habit-toggle]")) {
      const today = todayKey();
      state.habits = state.habits.map((habit) =>
        habit.id === target.dataset.habitToggle
          ? { ...habit, checks: { ...(habit.checks || {}), [today]: target.checked } }
          : habit,
      );
      changed = true;
    } else if (target === dom.plannerCategory) {
      state.selectedPlannerCategory = target.value;
      changed = true;
    } else if (target === dom.taskPeriod) {
      toggleWeekdayPicker();
    }

    if (changed) {
      writeStorage();
      renderAll();
    }
  }

  function savePlan(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const textarea = form.querySelector("textarea");
    const period = form.dataset.period;

    if (!textarea || !period) return;

    state.plans[plannerKey(period)] = textarea.value;
    writeStorage();
  }

  function clearCompleted() {
    state.tasks = state.tasks.filter((task) => !task.done);
    writeStorage();
    renderAll();
  }

  function showStorageWarning() {
    document.body.classList.add("storage-warning");
  }

  function bindEvents() {
    dom.taskForm.addEventListener("submit", addTask);
    dom.habitForm.addEventListener("submit", addHabit);
    dom.categoryForm.addEventListener("submit", addCategory);
    dom.clearCompleted.addEventListener("click", clearCompleted);
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("change", handleDocumentChange);
    dom.plannerCards.forEach((form) => form.addEventListener("submit", savePlan));
    dom.quoteForm.addEventListener("submit", saveQuote);
    dom.taskDateAddBtn.addEventListener("click", addPendingDate);
    dom.brainstormForm.addEventListener("submit", saveBrainstorm);
    dom.brainstormClear.addEventListener("click", clearBrainstorm);
    dom.blockForm.addEventListener("submit", addBlock);
    dom.todayTaskList.addEventListener("pointerdown", handleDragPointerDown);
    dom.taskDrawerClose.addEventListener("click", closeTaskDrawer);
    dom.taskDrawerBackdrop.addEventListener("click", closeTaskDrawer);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && editingTaskId) closeTaskDrawer();
    });
    window.addEventListener("appPageChange", function(e) {
      if (e.detail === "calendar") {
        if (!calendarInstance) {
          initCalendar();
        } else {
          setTimeout(function() { calendarInstance.updateSize(); }, 20);
        }
      }
    });
  }

  function selectedTaskDays() {
    return [...dom.taskWeekdays.querySelectorAll("input:checked")].map((input) => input.value);
  }

  function clearTaskDays() {
    dom.taskWeekdays.querySelectorAll("input").forEach((input) => {
      input.checked = false;
    });
    pendingDates = [];
    dom.taskDateInput.value = "";
    renderDateChips();
    toggleWeekdayPicker();
  }

  function toggleWeekdayPicker() {
    const period = dom.taskPeriod.value;
    dom.taskWeekdays.hidden = period !== "weekly";
    dom.taskDatePicker.hidden = period !== "specific";
  }

  function addPendingDate() {
    const val = dom.taskDateInput.value;
    if (!val || pendingDates.includes(val)) return;
    pendingDates.push(val);
    pendingDates.sort();
    dom.taskDateInput.value = "";
    renderDateChips();
  }

  function renderDateChips() {
    dom.taskDateChips.innerHTML = pendingDates
      .map((d) => `
        <span class="date-chip">
          ${escapeHtml(formatDates([d]))}
          <button class="date-chip-remove" type="button" data-remove-date="${escapeHtml(d)}" aria-label="Remove date">×</button>
        </span>
      `)
      .join("");
  }

  function saveBrainstorm(event) {
    event.preventDefault();
    state.brainstorm = dom.brainstormText.value;
    writeStorage();
  }

  function clearBrainstorm() {
    state.brainstorm = "";
    dom.brainstormText.value = "";
    writeStorage();
  }

  function renderBrainstorm() {
    dom.brainstormText.value = state.brainstorm || "";
  }


  // --- Calendar ---------------------------------------------------------------

  function getCalendarEvents(fetchInfo) {
    const events = [];
    const dayAbbr = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const today = todayKey();
    const viewStart = fetchInfo ? new Date(fetchInfo.start) : new Date();
    const viewEnd = fetchInfo ? new Date(fetchInfo.end) : new Date(Date.now() + 7 * 86400000);

    // User-created time blocks
    state.calendarEvents.forEach(function(block) {
      const cat = state.categories.find(function(c) { return c.id === block.categoryId; });
      events.push({
        id: block.id,
        title: block.title,
        start: block.start,
        end: block.end,
        backgroundColor: cat ? cat.color : "var(--accent)",
        borderColor: "transparent",
        textColor: "#fff",
      });
    });

    // Tasks as all-day events
    state.tasks.forEach(function(task) {
      const cat = state.categories.find(function(c) { return c.id === task.categoryId; });
      const color = cat ? cat.color : "#9A8B82";
      const base = {
        title: task.title,
        allDay: true,
        backgroundColor: color,
        borderColor: "transparent",
        textColor: "#fff",
        classNames: task.done ? ["fc-task-done"] : [],
        extendedProps: { isTask: true },
      };

      if (task.period === "specific" && task.dates && task.dates.length) {
        task.dates.forEach(function(d) {
          events.push(Object.assign({}, base, { id: "task-" + task.id + "-" + d, start: d }));
        });
      } else if (task.period === "weekly" && task.days && task.days.length) {
        const d = new Date(viewStart);
        while (d < viewEnd) {
          const key = dayAbbr[d.getDay()];
          if (task.days.includes(key)) {
            const ds = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
            events.push(Object.assign({}, base, { id: "task-" + task.id + "-" + ds, start: ds }));
          }
          d.setDate(d.getDate() + 1);
        }
      } else if (task.period === "daily") {
        events.push(Object.assign({}, base, { id: "task-daily-" + task.id, start: today }));
      }
    });

    return events;
  }

  function initCalendar() {
    if (!dom.calendarEl || calendarInstance) return;

    calendarInstance = new FullCalendar.Calendar(dom.calendarEl, {
      initialView: "timeGridWeek",
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay",
      },
      height: "auto",
      slotMinTime: "06:00:00",
      slotMaxTime: "23:30:00",
      nowIndicator: true,
      allDaySlot: true,
      editable: true,
      selectable: true,
      selectMirror: true,
      dayMaxEvents: true,
      events: function(info, successCallback) {
        successCallback(getCalendarEvents(info));
      },
      select: handleCalendarSelect,
      eventClick: handleCalendarEventClick,
      eventChange: handleCalendarEventChange,
    });

    calendarInstance.render();
  }

  function renderCalendar() {
    if (calendarInstance) {
      calendarInstance.refetchEvents();
    }
  }

  function handleCalendarSelect(info) {
    const date = info.startStr.slice(0, 10);
    const startTime = info.allDay ? "09:00" : info.startStr.slice(11, 16);
    const endTime = info.allDay ? "10:00" : (info.endStr.slice(11, 16) || "10:00");
    dom.blockDate.value = date;
    dom.blockStart.value = startTime;
    dom.blockEnd.value = endTime;
    dom.blockTitle.focus();
    calendarInstance.unselect();
  }

  function handleCalendarEventClick(info) {
    if (info.event.extendedProps.isTask) return;
    if (window.confirm('Delete "' + info.event.title + '"?')) {
      state.calendarEvents = state.calendarEvents.filter(function(e) {
        return e.id !== info.event.id;
      });
      writeStorage();
      calendarInstance.refetchEvents();
    }
  }

  function handleCalendarEventChange(info) {
    if (info.event.extendedProps.isTask) {
      info.revert();
      return;
    }
    const block = state.calendarEvents.find(function(e) { return e.id === info.event.id; });
    if (block) {
      block.start = info.event.startStr;
      block.end = info.event.endStr || block.end;
      writeStorage();
    }
  }

  function addBlock(event) {
    event.preventDefault();
    const title = dom.blockTitle.value.trim();
    const date = dom.blockDate.value;
    const start = dom.blockStart.value;
    const end = dom.blockEnd.value;
    if (!title || !date || !start || !end) return;

    const startDt = date + "T" + start;
    const endDt = date + "T" + end;
    if (endDt <= startDt) return;

    state.calendarEvents.push({
      id: makeId("block"),
      title,
      categoryId: dom.blockCategory.value,
      start: startDt,
      end: endDt,
    });

    dom.blockTitle.value = "";
    writeStorage();
    if (calendarInstance) calendarInstance.refetchEvents();
  }
  function showLoginOverlay() {
    const overlay = document.getElementById("login-overlay");
    if (overlay) overlay.hidden = false;
    const btn = document.getElementById("ribbon-logout");
    if (btn) btn.hidden = true;
  }

  function hideLoginOverlay() {
    const overlay = document.getElementById("login-overlay");
    if (overlay) overlay.hidden = true;
    const btn = document.getElementById("ribbon-logout");
    if (btn) btn.hidden = false;
  }

  function setLoginError(message) {
    const el = document.getElementById("login-error");
    if (el) el.textContent = message;
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    if (!sb) return;
    const email = document.getElementById("login-email");
    const password = document.getElementById("login-password");
    const submit = event.currentTarget.querySelector("[type=submit]");
    setLoginError("");
    submit.disabled = true;
    submit.textContent = "Signing in...";
    const { error } = await sb.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    });
    if (error) {
      setLoginError("Incorrect email or password.");
      submit.disabled = false;
      submit.textContent = "Sign in";
    }
  }

  async function startApp() {
    if (appStarted || appStarting) return;
    appStarting = true;
    log("Bootstrap: startApp begin");

    try {
      // Seed from localStorage so the UI has data while Supabase loads.
      // Discard if it belongs to a different user (cross-user contamination).
      const cached = loadState();
      if (currentUser && cached._userId && cached._userId !== currentUser.id) {
        log("Bootstrap: cached state is from a different user — discarding");
        state = createDefaultState();
      } else {
        state = cached;
      }

      if (sb && currentUser) {
        // Race loadFromSupabase against an 8 s timeout so a hung DB request
        // can't delay the app indefinitely — we fall back to cached state.
        const result = await Promise.race([
          loadFromSupabase(),
          new Promise(function(resolve) { setTimeout(function() { resolve("timeout"); }, 8000); }),
        ]);
        log("Bootstrap: loadFromSupabase →", result);

        if (result === "not_found") {
          state = createDefaultState();
          state._userId = currentUser.id;
          await syncToSupabase();
        } else if (result === "error" || result === "timeout") {
          log("Bootstrap: Supabase unavailable — running on cached state");
        }
        subscribeToChanges();
      }

      hideLoginOverlay();
      if (!eventsBound) {
        bindEvents();
        toggleWeekdayPicker();
        eventsBound = true;
      }
      renderAll();
      renderBrainstorm();
      appStarted = true;
      log("Bootstrap: startApp complete");
    } catch (err) {
      log("Bootstrap: startApp error —", err);
      appStarted = false;
    } finally {
      // hideLoadingOverlay is in finally so it is ALWAYS called, even if
      // an exception fires before we reach it inside the try block.
      appStarting = false;
      hideLoadingOverlay();
    }
  }

  function initAuth() {
    const loginForm = document.getElementById("login-form");
    if (loginForm) loginForm.addEventListener("submit", handleLoginSubmit);

    const logoutBtn = document.getElementById("ribbon-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function() { sb.auth.signOut(); });
    }

    // Hard deadline. If no auth event resolves the boot within 10 s the
    // session restore is stuck (expired refresh token, offline mid-refresh,
    // etc.). We wipe the stale session and show login so the user isn't
    // trapped on the loading screen.
    let bootstrapResolved = false;

    const bootstrapTimer = setTimeout(async function() {
      if (bootstrapResolved) return;
      bootstrapResolved = true;
      log("Bootstrap: timeout — forcing login screen");
      appStarted = false;
      appStarting = false;
      try { await sb.auth.signOut(); } catch {}
      hideLoadingOverlay();
      showLoginOverlay();
    }, 10000);

    function resolveBootstrap() {
      bootstrapResolved = true;
      clearTimeout(bootstrapTimer);
    }

    // INITIAL_SESSION is the primary boot trigger in Supabase v2.
    // It fires on every page load/reload — with the persisted session if one
    // exists, or null if there is none. SIGNED_IN handles fresh logins and any
    // edge cases where Supabase skips INITIAL_SESSION. TOKEN_REFRESHED is a
    // recovery path for cases where the initial event had a stale token.
    sb.auth.onAuthStateChange(async function(event, session) {
      log("Auth event:", event);

      if (event === "INITIAL_SESSION") {
        resolveBootstrap();
        if (session) {
          currentUser = session.user;
          if (!appStarted && !appStarting) await startApp();
        } else {
          hideLoadingOverlay();
          showLoginOverlay();
        }

      } else if (event === "SIGNED_IN" && session) {
        currentUser = session.user;
        resolveBootstrap();
        if (!appStarted && !appStarting) await startApp();

      } else if (event === "TOKEN_REFRESHED" && session) {
        currentUser = session.user;
        // Recovery: fires after INITIAL_SESSION if a token refresh was needed.
        // If the app hasn't started yet, this is our cue to boot.
        if (!appStarted && !appStarting) {
          resolveBootstrap();
          await startApp();
        }

      } else if (event === "SIGNED_OUT") {
        currentUser = null;
        appStarted = false;
        appStarting = false;
        resolveBootstrap();
        hideLoadingOverlay();
        showLoginOverlay();
      }
    });
  }

  async function init() {
    cleanLegacyStorage();
    cacheDom();

    if (!requiredDomExists()) {
      console.error("Focus could not start because required page elements are missing.");
      hideLoadingOverlay();
      return;
    }

    dom.currentDate.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(new Date());

    if (sb) {
      initAuth();
    } else {
      await startApp();
    }
  }

  // --- Task edit drawer -------------------------------------------------------

  function openTaskDrawer(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;

    editingTaskId = id;
    editPendingDates = [...(task.dates || [])];

    const categoryOptions = state.categories
      .map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === task.categoryId ? "selected" : ""}>${escapeHtml(c.name)}</option>`)
      .join("");

    dom.taskDrawerBody.innerHTML = `
      <input id="drawer-task-title" type="text" value="${escapeHtml(task.title)}" placeholder="Task title..." />
      <div class="form-row drawer-selects">
        <select id="drawer-task-category">${categoryOptions}</select>
        <select id="drawer-task-period">
          <option value="daily" ${task.period === "daily" ? "selected" : ""}>Daily</option>
          <option value="weekly" ${task.period === "weekly" ? "selected" : ""}>Weekly</option>
          <option value="monthly" ${task.period === "monthly" ? "selected" : ""}>Monthly</option>
          <option value="specific" ${task.period === "specific" ? "selected" : ""}>Specific date(s)</option>
        </select>
      </div>
      <fieldset class="weekday-picker" id="drawer-weekdays" ${task.period !== "weekly" ? "hidden" : ""}>
        <legend>Which days?</legend>
        ${weekdays.map((wd) => `<label><input type="checkbox" class="drawer-weekday-check" value="${wd.id}" ${(task.days || []).includes(wd.id) ? "checked" : ""} />${wd.label}</label>`).join("")}
      </fieldset>
      <div class="date-picker" id="drawer-date-picker" ${task.period !== "specific" ? "hidden" : ""}>
        <p class="date-picker-label">Which date(s)?</p>
        <div class="date-picker-input-row">
          <input type="date" id="drawer-date-input" />
          <button type="button" id="drawer-date-add-btn" class="date-add-btn">Add date</button>
        </div>
        <div class="date-chip-list" id="drawer-date-chips"></div>
      </div>
      <div class="drawer-toggles">
        <label class="priority-label">
          <input type="checkbox" id="drawer-priority" ${task.priority === "high" ? "checked" : ""} />
          <span>High priority</span>
        </label>
        <label class="priority-label">
          <input type="checkbox" id="drawer-done" ${task.done ? "checked" : ""} />
          <span>Mark complete</span>
        </label>
      </div>
      <div class="drawer-actions">
        <button type="button" id="drawer-save-btn" class="drawer-save-btn">Save changes</button>
        <button type="button" id="drawer-cancel-btn" class="ghost-button">Cancel</button>
      </div>
    `;

    renderDrawerDateChips();

    document.getElementById("drawer-task-period").addEventListener("change", toggleDrawerPickers);
    document.getElementById("drawer-date-add-btn").addEventListener("click", addDrawerDate);
    document.getElementById("drawer-save-btn").addEventListener("click", saveTaskFromDrawer);
    document.getElementById("drawer-cancel-btn").addEventListener("click", closeTaskDrawer);

    dom.taskDrawer.classList.add("open");
    dom.taskDrawer.setAttribute("aria-hidden", "false");

    requestAnimationFrame(() => {
      const titleInput = document.getElementById("drawer-task-title");
      if (titleInput) { titleInput.focus(); titleInput.select(); }
    });
  }

  function closeTaskDrawer() {
    if (!dom.taskDrawer) return;
    dom.taskDrawer.classList.remove("open");
    dom.taskDrawer.setAttribute("aria-hidden", "true");
    editingTaskId = null;
    editPendingDates = [];
  }

  function saveTaskFromDrawer() {
    if (!editingTaskId) return;

    const titleInput = document.getElementById("drawer-task-title");
    const categorySelect = document.getElementById("drawer-task-category");
    const periodSelect = document.getElementById("drawer-task-period");
    const priorityCheck = document.getElementById("drawer-priority");
    const doneCheck = document.getElementById("drawer-done");

    const title = titleInput ? titleInput.value.trim() : "";
    if (!title) {
      if (titleInput) titleInput.focus();
      return;
    }

    const period = periodSelect ? periodSelect.value : "daily";
    const days = period === "weekly"
      ? [...document.querySelectorAll(".drawer-weekday-check:checked")].map((el) => el.value)
      : [];
    const dates = period === "specific" ? [...editPendingDates] : [];

    state.tasks = state.tasks.map((task) =>
      task.id === editingTaskId
        ? {
            ...task,
            title,
            categoryId: categorySelect ? categorySelect.value : task.categoryId,
            period,
            days,
            dates,
            priority: priorityCheck && priorityCheck.checked ? "high" : "normal",
            done: doneCheck ? doneCheck.checked : task.done,
          }
        : task
    );

    closeTaskDrawer();
    writeStorage();
    renderAll();
  }

  function toggleDrawerPickers() {
    const periodSelect = document.getElementById("drawer-task-period");
    if (!periodSelect) return;
    const val = periodSelect.value;
    const weekdaysPicker = document.getElementById("drawer-weekdays");
    const datePicker = document.getElementById("drawer-date-picker");
    if (weekdaysPicker) weekdaysPicker.hidden = val !== "weekly";
    if (datePicker) datePicker.hidden = val !== "specific";
  }

  function addDrawerDate() {
    const input = document.getElementById("drawer-date-input");
    if (!input) return;
    const val = input.value;
    if (!val || editPendingDates.includes(val)) return;
    editPendingDates.push(val);
    editPendingDates.sort();
    input.value = "";
    renderDrawerDateChips();
  }

  function renderDrawerDateChips() {
    const container = document.getElementById("drawer-date-chips");
    if (!container) return;
    container.innerHTML = editPendingDates
      .map((d) => `
        <span class="date-chip">
          ${escapeHtml(formatDates([d]))}
          <button class="date-chip-remove" type="button" data-drawer-remove-date="${escapeHtml(d)}" aria-label="Remove date">×</button>
        </span>
      `)
      .join("");
  }

  // --- Dashboard drag & drop --------------------------------------------------

  function handleDragPointerDown(e) {
    const handle = e.target.closest("[data-drag-task]");
    if (!handle) return;
    e.preventDefault();

    const taskId = handle.dataset.dragTask;
    const item = handle.closest(".task-item");
    if (!item) return;

    const rect = item.getBoundingClientRect();
    const ghost = item.cloneNode(true);
    ghost.classList.add("task-drag-ghost");
    ghost.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;pointer-events:none;z-index:500;margin:0;box-sizing:border-box;`;
    document.body.appendChild(ghost);
    item.classList.add("task-dragging");

    dragState = {
      taskId,
      item,
      ghost,
      list: dom.todayTaskList,
      startY: e.clientY,
      startTop: rect.top,
    };

    document.addEventListener("pointermove", handleDragPointerMove, { passive: false });
    document.addEventListener("pointerup", handleDragPointerUp);
  }

  function handleDragPointerMove(e) {
    if (!dragState) return;
    e.preventDefault();

    const { ghost, item, list, startY, startTop } = dragState;
    const dy = e.clientY - startY;
    ghost.style.top = (startTop + dy) + "px";

    const ghostRect = ghost.getBoundingClientRect();
    const ghostMid = ghostRect.top + ghostRect.height / 2;
    const siblings = [...list.querySelectorAll(".task-item[data-task-id]")].filter((el) => el !== item);

    let insertBefore = null;
    for (const sibling of siblings) {
      const sibRect = sibling.getBoundingClientRect();
      if (ghostMid < sibRect.top + sibRect.height / 2) {
        insertBefore = sibling;
        break;
      }
    }

    if (insertBefore) {
      list.insertBefore(item, insertBefore);
    } else {
      list.appendChild(item);
    }
  }

  function handleDragPointerUp() {
    if (!dragState) return;

    const { ghost, item, list } = dragState;
    ghost.remove();
    item.classList.remove("task-dragging");

    const newOrder = [...list.querySelectorAll(".task-item[data-task-id]")].map((el) => el.dataset.taskId);
    state.dashboardOrder = newOrder;
    writeStorage();

    document.removeEventListener("pointermove", handleDragPointerMove);
    document.removeEventListener("pointerup", handleDragPointerUp);
    dragState = null;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

