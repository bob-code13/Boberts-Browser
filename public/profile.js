(async () => {
  const button = document.getElementById("profile-button");
  const menu = document.getElementById("profile-menu");
  if (!button || !menu) return;
  let me;
  try {
    const response = await fetch("/api/me", { cache: "no-store" });
    if (!response.ok) return;
    me = await response.json();
  } catch { return; }
  button.textContent = me.initials || "BB";
  button.setAttribute("aria-label", `Profile: ${me.name}`);
  document.getElementById("profile-name").textContent = me.name;
  document.getElementById("profile-email").textContent = me.email;
  document.getElementById("profile-hours").textContent = `${me.hours.toFixed(2)} hours used`;
  document.getElementById("admin-link").hidden = !me.admin;
  button.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    button.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".profile-wrap")) {
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  });
  async function heartbeat() {
    if (document.visibilityState !== "visible") return;
    try {
      const response = await fetch("/api/heartbeat", { method: "POST", cache: "no-store" });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      if (!response.ok) return;
      const data = await response.json();
      if (Number.isFinite(data.hours)) document.getElementById("profile-hours").textContent = data.hours.toFixed(2) + " hours used";
    } catch { return; }
  }
  await heartbeat();
  setInterval(heartbeat, 60000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") heartbeat();
  });
})();
