"use strict";

const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const searchEngine = document.getElementById("sj-search-engine");
const error = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");
const browserChrome = document.getElementById("browser-chrome");
const tabStrip = document.getElementById("tab-strip");
const newTabButton = document.getElementById("new-tab");
const homeButton = document.getElementById("home-button");
const tabAddressForm = document.getElementById("tab-address-form");
const tabAddress = document.getElementById("tab-address");
const tabFrames = document.getElementById("tab-frames");
const backButton = document.getElementById("back-button");
const forwardButton = document.getElementById("forward-button");
const reloadButton = document.getElementById("reload-button");
const bookmarkButton = document.getElementById("bookmark-button");
const bookmarksToggle = document.getElementById("bookmarks-toggle");
const bookmarksPanel = document.getElementById("bookmarks-panel");
const bookmarksClose = document.getElementById("bookmarks-close");
const bookmarksList = document.getElementById("bookmarks-list");
const bookmarksKey = "boberts-browser-bookmarks-v1";
let bookmarks = [];
try {
  const stored = JSON.parse(localStorage.getItem(bookmarksKey) || "[]");
  if (Array.isArray(stored)) bookmarks = stored.filter((item) => item && typeof item.url === "string" && typeof item.title === "string").slice(0, 250);
} catch (err) {
  console.warn("Bookmarks storage unavailable", err);
}
function saveBookmarks() {
  try { localStorage.setItem(bookmarksKey, JSON.stringify(bookmarks)); }
  catch (err) { console.warn("Could not save bookmarks", err); alert("Bookmarks could not be saved on this device."); }
}
function renderBookmarks() {
  bookmarksList.replaceChildren();
  if (!bookmarks.length) {
    const empty = document.createElement("p");
    empty.className = "bookmarks-empty";
    empty.textContent = "No bookmarks yet. Open a website and click the star.";
    bookmarksList.append(empty);
  }
  for (const item of bookmarks) {
    const row = document.createElement("div");
    row.className = "bookmark-row";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "bookmark-open";
    open.textContent = item.title;
    open.title = item.url;
    open.addEventListener("click", () => {
      const tab = tabs.find((candidate) => candidate.id === activeTabId);
      if (tab) void navigateTab(tab, item.url);
      bookmarksPanel.hidden = true;
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "bookmark-remove";
    remove.textContent = "×";
    remove.title = "Remove bookmark";
    remove.setAttribute("aria-label", "Remove " + item.title);
    remove.addEventListener("click", () => {
      bookmarks = bookmarks.filter((entry) => entry.url !== item.url);
      saveBookmarks();
      renderBookmarks();
      renderNavigationControls();
    });
    row.append(open, remove);
    bookmarksList.append(row);
  }
}
function renderNavigationControls() {
  const tab = tabs.find((item) => item.id === activeTabId);
  // The embedded browser maintains its own history, including clicked links.
  // History length does not expose the current index, so buttons remain available
  // while a page is open; the browser ignores navigation past either end.
  const hasPage = Boolean(tab && tab.frame);
  backButton.disabled = !hasPage;
  forwardButton.disabled = !hasPage;
  reloadButton.disabled = !tab || !tab.url;
  bookmarkButton.disabled = !tab || !tab.url;
  bookmarkButton.textContent = tab && bookmarks.some((item) => item.url === tab.url) ? "★" : "☆";
}
function navigateHistory(tab, offset) {
  if (!tab.frame) return;
  try {
    const frameWindow = tab.frame.frame.contentWindow;
    if (!frameWindow) return;
    // Use the iframe's actual session history so in-page links, redirects and
    // pushState entries participate, rather than replaying address-bar URLs.
    frameWindow.history.go(offset);
  } catch (err) {
    console.warn("Unable to navigate embedded page history", err);
  }
}


let scramjet;
let connection;
let startupError = null;
try {
const { ScramjetController } = $scramjetLoadController();
scramjet = new ScramjetController({
  files: {
    wasm: "/scram/scramjet.wasm.wasm",
    all: "/scram/scramjet.all.js",
    sync: "/scram/scramjet.sync.js",
  },
});
scramjet.init();

connection = new BareMux.BareMuxConnection("/baremux/worker.js");
} catch (err) {
  startupError = err;
  console.error("Proxy startup failed", err);
}
const tabs = [];
let activeTabId = null;
let nextTabId = 1;
let readyPromise = null;

function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await registerSW();
      const wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
      if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
        await connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
      }
    })().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

function renderTabs() {
  const hasTabs = tabs.length > 0;
  document.body.classList.add("tabs-open");
  browserChrome.hidden = false;
  tabFrames.hidden = false;
  tabStrip.replaceChildren();

  for (const tab of tabs) {
    const wrapper = document.createElement("div");
    wrapper.className = "browser-tab";
    wrapper.setAttribute("role", "tab");
    wrapper.setAttribute("aria-selected", String(tab.id === activeTabId));
    const select = document.createElement("button");
    select.type = "button";
    select.className = "tab-select";
    select.textContent = tab.title;
    select.title = tab.url || "New tab";
    select.addEventListener("click", () => activateTab(tab.id));
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close " + tab.title);
    close.addEventListener("click", () => closeTab(tab.id));
    wrapper.append(select, close);
    tabStrip.append(wrapper);
    if (tab.frame) tab.frame.frame.hidden = tab.id !== activeTabId;
    if (tab.home) tab.home.hidden = tab.id !== activeTabId || Boolean(tab.frame);
  }
  const active = tabs.find((tab) => tab.id === activeTabId);
  tabAddress.value = active ? active.url : "";
  document.title = active ? active.title + " — Bobert's Browser" : "Bobert's Browser";
  renderNavigationControls();
}

function activateTab(id) {
  activeTabId = id;
  renderTabs();
}

function createTab(url = "") {
  const tab = { id: nextTabId++, url: "", title: "New Tab", frame: null, home: null, navigationId: 0, history: [], historyIndex: -1 };
  const home = document.getElementById("new-tab-template").content.firstElementChild.cloneNode(true);
  const homeForm = home.querySelector(".tab-home-form");
  const homeInput = home.querySelector(".tab-home-input");
  homeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (homeInput.value.trim()) void navigateTab(tab, homeInput.value);
  });
  tab.home = home;
  tabFrames.appendChild(home);
  tabs.push(tab);
  activateTab(tab.id);
  if (url) void navigateTab(tab, url);
  else homeInput.focus();
  return tab;
}

function closeTab(id) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const tab = tabs[index];
  tab.navigationId++;
  if (tab.frame) tab.frame.frame.remove();
  if (tab.home) tab.home.remove();
  tabs.splice(index, 1);
  if (activeTabId === id) {
    activeTabId = tabs[Math.min(index, tabs.length - 1)]?.id ?? null;
  }
  if (!tabs.length) createTab();
  else renderTabs();
}

async function navigateTab(tab, input, addHistory = true) {
  if (!input.trim()) return;
  const url = typeof search === "function" ? search(input.trim(), searchEngine.value) : "https://duckduckgo.com/?q=" + encodeURIComponent(input.trim());
  const navigationId = ++tab.navigationId;
  if (addHistory && tab.history[tab.historyIndex] !== url) {
    tab.history = tab.history.slice(0, tab.historyIndex + 1);
    tab.history.push(url);
    tab.historyIndex = tab.history.length - 1;
  }
  tab.url = url;
  try {
    tab.title = new URL(url).hostname || "New Tab";
  } catch {
    tab.title = "New Tab";
  }
  renderTabs();
  try {
    await ensureReady();
    // A closed tab must not resurrect itself after async initialization.
    if (!tabs.includes(tab) || navigationId !== tab.navigationId) return;
    if (!tab.frame) {
      tab.frame = scramjet.createFrame();
      tab.frame.frame.classList.add("browser-page");
      tabFrames.appendChild(tab.frame.frame);
    }
    tab.frame.frame.hidden = tab.id !== activeTabId;
    if (tab.home) tab.home.hidden = true;
    tab.frame.go(url);
    renderNavigationControls();
  } catch (err) {
    error.textContent = "Unable to open website.";
    errorCode.textContent = String(err);
    console.error("Bobert's Browser navigation failed", err);
    if (tabs.includes(tab)) {
      activateTab(tab.id);
      alert("Unable to open website: " + String(err));
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const tab = tabs.find((item) => item.id === activeTabId);
  if (tab && address.value.trim()) void navigateTab(tab, address.value);
});
tabAddressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const tab = tabs.find((item) => item.id === activeTabId);
  if (tab) void navigateTab(tab, tabAddress.value);
});
newTabButton.addEventListener("click", () => createTab());
backButton.addEventListener("click", () => {
  const tab = tabs.find((item) => item.id === activeTabId);
  if (tab) navigateHistory(tab, -1);
});
forwardButton.addEventListener("click", () => {
  const tab = tabs.find((item) => item.id === activeTabId);
  if (tab) navigateHistory(tab, 1);
});
reloadButton.addEventListener("click", () => {
  const tab = tabs.find((item) => item.id === activeTabId);
  if (tab && tab.url) void navigateTab(tab, tab.url, false);
});
bookmarkButton.addEventListener("click", () => {
  const tab = tabs.find((item) => item.id === activeTabId);
  if (!tab || !tab.url) return;
  if (bookmarks.some((item) => item.url === tab.url)) {
    bookmarks = bookmarks.filter((item) => item.url !== tab.url);
  } else {
    bookmarks.unshift({ url: tab.url, title: tab.title });
  }
  saveBookmarks();
  renderBookmarks();
  renderNavigationControls();
});
bookmarksToggle.addEventListener("click", () => {
  bookmarksPanel.hidden = !bookmarksPanel.hidden;
  if (!bookmarksPanel.hidden) renderBookmarks();
});
bookmarksClose.addEventListener("click", () => { bookmarksPanel.hidden = true; });
homeButton.addEventListener("click", () => {
  const tab = tabs.find((item) => item.id === activeTabId);
  if (!tab) return;
  tab.navigationId++;
  if (tab.frame) { tab.frame.frame.remove(); tab.frame = null; }
  tab.url = "";
  tab.title = "New Tab";
  tab.history = [];
  tab.historyIndex = -1;
  tab.home.hidden = false;
  tab.home.querySelector(".tab-home-input").value = "";
  renderTabs();
  tab.home.querySelector(".tab-home-input").focus();
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "t") {
    event.preventDefault();
    createTab();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w" && tabs.length) {
    event.preventDefault();
    closeTab(activeTabId);
  }
});
// Open directly into the browser shell so tabs and address bar are always visible.
createTab();
if (startupError) {
  error.textContent = "This device could not start the browser proxy. Try updating your browser or clearing this site\u0027s cached data.";
  errorCode.textContent = String(startupError);
}
