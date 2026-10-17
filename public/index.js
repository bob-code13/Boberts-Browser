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

const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
  files: {
    wasm: "/scram/scramjet.wasm.wasm",
    all: "/scram/scramjet.all.js",
    sync: "/scram/scramjet.sync.js",
  },
});
scramjet.init();

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
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
}

function activateTab(id) {
  activeTabId = id;
  renderTabs();
}

function createTab(url = "") {
  const tab = { id: nextTabId++, url: "", title: "New Tab", frame: null, home: null, navigationId: 0 };
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

async function navigateTab(tab, input) {
  if (!input.trim()) return;
  const url = search(input.trim(), searchEngine.value);
  const navigationId = ++tab.navigationId;
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
homeButton.addEventListener("click", () => {
  const tab = tabs.find((item) => item.id === activeTabId);
  if (!tab) return;
  tab.navigationId++;
  if (tab.frame) { tab.frame.frame.remove(); tab.frame = null; }
  tab.url = "";
  tab.title = "New Tab";
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
