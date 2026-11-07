const STORAGE_KEY = "taskflow.tasks.v1";
let tasks = loadFromLocalStorage();
let currentFilter = "all";
let currentCategory = null;
let editingId = null;
let draggedId = null;
let toastTimer;

const $ = (selector) => document.querySelector(selector);
const taskList = $("#taskList");
const dialog = $("#taskDialog");
const form = $("#taskForm");

function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Could not read saved tasks:", error);
    return [];
  }
}

function saveToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return true;
  } catch (error) {
    console.error("Could not save tasks:", error);
    showToast("Could not save. Check browser storage settings.");
    return false;
  }
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function dateState(dateString, completed) {
  if (!dateString || completed) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateString}T00:00:00`);
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  return "";
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function updateSummary() {
  const total = tasks.length;
  const completed = tasks.filter(task => task.completed).length;
  const active = total - completed;
  const overdue = tasks.filter(task => !task.completed && task.due && dateState(task.due, false) === "overdue").length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  $("#allCount").textContent = total;
  $("#activeCount").textContent = active;
  $("#completedCount").textContent = completed;
  $("#totalStat").textContent = total;
  $("#activeStat").textContent = active;
  $("#doneStat").textContent = completed;
  $("#overdueStat").textContent = overdue;
  $("#progressText").textContent = `${percent}%`;
  $("#progressBar").style.width = `${percent}%`;
}

function filteredTasks() {
  const query = $("#searchInput").value.trim().toLowerCase();
  let result = tasks.filter(task => {
    const statusMatch = currentFilter === "all" || (currentFilter === "active" && !task.completed) || (currentFilter === "completed" && task.completed);
    const categoryMatch = !currentCategory || task.category === currentCategory;
    const textMatch = !query || `${task.title} ${task.description || ""} ${task.category}`.toLowerCase().includes(query);
    return statusMatch && categoryMatch && textMatch;
  });
  const sort = $("#sortSelect").value;
  if (sort === "due") result.sort((a, b) => (a.due || "9999-12-31").localeCompare(b.due || "9999-12-31"));
  else if (sort === "az") result.sort((a, b) => a.title.localeCompare(b.title));
  else result.sort((a, b) => b.createdAt - a.createdAt);
  return result;
}

function renderTasks() {
  const visible = filteredTasks();
  taskList.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = currentFilter === "completed" ? "✓" : "＋";
    const title = document.createElement("h3");
    title.textContent = $("#searchInput").value.trim() ? "No matching tasks" : currentFilter === "completed" ? "Nothing completed yet" : "Your list is clear";
    const message = document.createElement("p");
    message.textContent = $("#searchInput").value.trim() ? "Try a different search term." : "Add a task to get your work moving.";
    empty.append(icon, title, message);
    if (!$("#searchInput").value.trim() && currentFilter !== "completed") {
      const add = document.createElement("button");
      add.className = "primary-button";
      add.textContent = "+ Create your first task";
      add.addEventListener("click", () => openDialog());
      empty.append(add);
    }
    taskList.append(empty);
  } else {
    visible.forEach(task => taskList.append(createTaskElement(task)));
  }
  $("#shownCount").textContent = `Showing ${visible.length} of ${tasks.length} tasks`;
  $("#clearCompleted").hidden = !tasks.some(task => task.completed);
  updateSummary();
}

function createTaskElement(task) {
  const article = document.createElement("article");
  article.className = `task-item${task.completed ? " is-complete" : ""}`;
  article.draggable = true;
  article.dataset.id = task.id;

  const check = document.createElement("button");
  check.className = "check-button";
  check.type = "button";
  check.setAttribute("aria-label", task.completed ? "Mark task active" : "Mark task complete");
  check.textContent = task.completed ? "✓" : "";
  check.addEventListener("click", () => toggleTask(task.id));

  const content = document.createElement("div");
  content.className = "task-content";
  const title = document.createElement("div");
  title.className = "task-title";
  title.textContent = task.title;
  content.append(title);

  if (task.description) {
    const description = document.createElement("div");
    description.className = "task-description";
    description.textContent = task.description;
    content.append(description);
  }

  const meta = document.createElement("div");
  meta.className = "task-meta";
  const category = document.createElement("span");
  category.className = `category-pill ${task.category.toLowerCase()}`;
  category.textContent = task.category;
  meta.append(category);

  if (task.due) {
    const due = document.createElement("span");
    const state = dateState(task.due, task.completed);
    due.className = `due-label ${state}`;
    due.textContent = `${state === "overdue" ? "Overdue · " : state === "today" ? "Due today · " : "Due · "}${formatDate(task.due)}`;
    meta.append(due);
  }
  content.append(meta);

  const actions = document.createElement("div");
  actions.className = "task-actions";
  const edit = document.createElement("button");
  edit.className = "icon-button";
  edit.type = "button";
  edit.title = "Edit task";
  edit.setAttribute("aria-label", `Edit ${task.title}`);
  edit.textContent = "✎";
  edit.addEventListener("click", () => openDialog(task.id));
  const remove = document.createElement("button");
  remove.className = "icon-button delete";
  remove.type = "button";
  remove.title = "Delete task";
  remove.setAttribute("aria-label", `Delete ${task.title}`);
  remove.textContent = "×";
  remove.addEventListener("click", () => deleteTask(task.id));
  actions.append(edit, remove);
  article.append(check, content, actions);

  article.addEventListener("dragstart", event => {
    draggedId = task.id;
    article.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  });
  article.addEventListener("dragend", () => {
    draggedId = null;
    article.classList.remove("dragging");
    document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
  });
  article.addEventListener("dragover", event => {
    event.preventDefault();
    if (draggedId && draggedId !== task.id) article.classList.add("drag-over");
  });
  article.addEventListener("dragleave", () => article.classList.remove("drag-over"));
  article.addEventListener("drop", event => {
    event.preventDefault();
    article.classList.remove("drag-over");
    const fromId = event.dataTransfer.getData("text/plain") || draggedId;
    reorderTasks(fromId, task.id);
  });
  return article;
}

function reorderTasks(fromId, toId) {
  if (!fromId || fromId === toId) return;
  const fromIndex = tasks.findIndex(task => task.id === fromId);
  const toIndex = tasks.findIndex(task => task.id === toId);
  if (fromIndex < 0 || toIndex < 0) return;
  const [moved] = tasks.splice(fromIndex, 1);
  tasks.splice(toIndex, 0, moved);
  tasks.forEach((task, index) => task.createdAt = Date.now() - index);
  saveToLocalStorage();
  renderTasks();
}

function openDialog(id = null) {
  editingId = id;
  form.reset();
  const task = id ? tasks.find(item => item.id === id) : null;
  $("#dialogTitle").textContent = task ? "Edit task" : "Create a task";
  $("#submitTask").textContent = task ? "Save changes" : "Create task";
  if (task) {
    $("#taskTitle").value = task.title;
    $("#taskDescription").value = task.description || "";
    $("#taskCategory").value = task.category;
    $("#taskDue").value = task.due || "";
  } else if (currentCategory) {
    $("#taskCategory").value = currentCategory;
  }
  dialog.showModal();
  $("#taskTitle").focus();
}

function closeDialog() {
  dialog.close();
  editingId = null;
}

function handleSubmit(event) {
  event.preventDefault();
  const title = $("#taskTitle").value.trim();
  if (!title) return;
  const data = {
    title,
    description: $("#taskDescription").value.trim(),
    category: $("#taskCategory").value,
    due: $("#taskDue").value
  };
  if (editingId) {
    const index = tasks.findIndex(task => task.id === editingId);
    if (index !== -1) tasks[index] = { ...tasks[index], ...data, updatedAt: Date.now() };
    showToast("Task updated");
  } else {
    tasks.unshift({ id: makeId(), ...data, completed: false, createdAt: Date.now() });
    showToast("Task created");
  }
  saveToLocalStorage();
  closeDialog();
  renderTasks();
}

function toggleTask(id) {
  const task = tasks.find(item => item.id === id);
  if (!task) return;
  task.completed = !task.completed;
  task.updatedAt = Date.now();
  saveToLocalStorage();
  renderTasks();
  showToast(task.completed ? "Task completed. Nice work!" : "Task moved back to active");
}

function deleteTask(id) {
  const task = tasks.find(item => item.id === id);
  if (!task) return;
  if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
  tasks = tasks.filter(item => item.id !== id);
  saveToLocalStorage();
  renderTasks();
  showToast("Task deleted");
}

function setFilter(filter) {
  currentFilter = filter;
  currentCategory = null;
  $("#pageTitle").textContent = filter === "all" ? "All tasks" : filter === "active" ? "Active tasks" : "Completed tasks";
  document.querySelectorAll(".nav-item[data-filter]").forEach(button => button.classList.toggle("active", button.dataset.filter === filter));
  document.querySelectorAll(".filter-chip").forEach(button => button.classList.toggle("selected", button.dataset.filter === filter));
  document.querySelectorAll(".category-nav").forEach(button => button.classList.remove("active"));
  renderTasks();
}

document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => setFilter(button.dataset.filter)));
document.querySelectorAll(".category-nav").forEach(button => button.addEventListener("click", () => {
  currentCategory = button.dataset.category;
  currentFilter = "all";
  $("#pageTitle").textContent = `${currentCategory} tasks`;
  document.querySelectorAll(".nav-item[data-filter], .filter-chip").forEach(item => item.classList.remove("active", "selected"));
  document.querySelectorAll(".category-nav").forEach(item => item.classList.toggle("active", item === button));
  renderTasks();
}));
$("#addTaskButton").addEventListener("click", () => openDialog());
$("#mobileAdd").addEventListener("click", () => openDialog());
$("#closeDialog").addEventListener("click", closeDialog);
$("#cancelDialog").addEventListener("click", closeDialog);
form.addEventListener("submit", handleSubmit);
$("#searchInput").addEventListener("input", renderTasks);
$("#sortSelect").addEventListener("change", renderTasks);
$("#clearCompleted").addEventListener("click", () => {
  const count = tasks.filter(task => task.completed).length;
  if (!count || !confirm(`Delete all ${count} completed task(s)?`)) return;
  tasks = tasks.filter(task => !task.completed);
  saveToLocalStorage();
  renderTasks();
  showToast("Completed tasks cleared");
});
$("#todayLabel").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase();
renderTasks();
