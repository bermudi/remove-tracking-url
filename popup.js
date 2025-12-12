async function getEnabled() {
  const { enabled } = await browser.storage.local.get({ enabled: true });
  return Boolean(enabled);
}

async function setEnabled(enabled) {
  await browser.storage.local.set({ enabled: Boolean(enabled) });
}

function renderEnabled(enabled) {
  const statusText = document.getElementById("statusText");
  const toggle = document.getElementById("enabledToggle");

  toggle.checked = enabled;
  statusText.textContent = enabled ? "On" : "Off";
  statusText.classList.toggle("on", enabled);
  statusText.classList.toggle("off", !enabled);
}

document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("enabledToggle");
  const cleanAllTabsBtn = document.getElementById("cleanAllTabsBtn");

  const enabled = await getEnabled();
  renderEnabled(enabled);

  toggle.addEventListener("change", async () => {
    await setEnabled(toggle.checked);
    renderEnabled(toggle.checked);
  });

  cleanAllTabsBtn.addEventListener("click", async () => {
    await browser.runtime.sendMessage({ type: "cleanAllTabs" });
    window.close();
  });
});
