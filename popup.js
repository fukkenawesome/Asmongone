// Copyright (c) 2026 @fukkenawesome
// SPDX-License-Identifier: GPL-3.0-only
document.addEventListener("DOMContentLoaded", () => {
  const auditList = document.getElementById("auditList");
  const searchInput = document.getElementById("searchInput");
  const totalBadge = document.getElementById("totalBadge");
  const clearLogBtn = document.getElementById("clearLogBtn");
  const excludedSiteInputs = document.querySelectorAll("[data-excluded-site]");

  let fullLog = [];

  function renderList(items) {
    auditList.innerHTML = "";

    // hanlde empty state
    if (items.length === 0) {
      auditList.innerHTML = `<div class="empty-state">No removed elements found.</div>`;
      return;
    }

    //Create Item Cards for each log entry
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "item-card";

      card.innerHTML = `
        <div class="item-meta">
          <span><strong>${item.platform}</strong> • ${item.timestamp}</span>
          <span class="item-tag">Trigger: ${item.matchedTerm}</span>
        </div>
        <div class="snippet">${escapeHtml(item.snippet)}</div>
        <div class="actions">
          <a href="${encodeURI(item.url)}" target="_blank" rel="noopener">Open Source Link</a>
        </div>
      `;

      const sourceLink = card.querySelector(".actions a");
      sourceLink.href = getUnfilteredUrl(item.url);
      sourceLink.title = sourceLink.href;
      auditList.appendChild(card);
    });
  }

  /*
  Add a query parameter to the URL to bypass filtering, allowing users to view the original content.
  Users can view the original content by opening the source link in the audit log. As an option for users who want to
  see the unfiltered content without the extension's intervention. The parameter "asmongone_unfiltered=1" is added to the URL,
  if present, the content script will ignore the content for filtering. 
  */
  function getUnfilteredUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      url.searchParams.set("asmongone_unfiltered", "1");
      return url.href;
    } catch {
      return rawUrl;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderCurrentList() {
    const query = searchInput.value.toLowerCase().trim();
    const filtered = fullLog.filter((item) =>
      item.snippet.toLowerCase().includes(query) ||
      item.matchedTerm.toLowerCase().includes(query) ||
      item.platform.toLowerCase().includes(query)
    );
    renderList(filtered);
  }

  // Load audit records from storage
  chrome.storage.local.get(["auditLog", "purgeCount", "excludedSites"], (res) => {
    fullLog = Array.isArray(res.auditLog) ? res.auditLog : [];
    totalBadge.textContent = Number.isFinite(res.purgeCount) ? res.purgeCount : 0;
    const excludedSites = Array.isArray(res.excludedSites) ? res.excludedSites : [];
    excludedSiteInputs.forEach((input) => {
      input.checked = excludedSites.includes(input.dataset.excludedSite);
    });
    renderCurrentList();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    if (Array.isArray(changes.auditLog?.newValue)) {
      fullLog = changes.auditLog.newValue;
    }
    if (Number.isFinite(changes.purgeCount?.newValue)) {
      totalBadge.textContent = changes.purgeCount.newValue;
    }
    if (Array.isArray(changes.excludedSites?.newValue)) {
      excludedSiteInputs.forEach((input) => {
        input.checked = changes.excludedSites.newValue.includes(input.dataset.excludedSite);
      });
    }
    renderCurrentList();
  });

  excludedSiteInputs.forEach((input) => {
    input.addEventListener("change", () => {
      const excludedSites = Array.from(excludedSiteInputs)
        .filter((siteInput) => siteInput.checked)
        .map((siteInput) => siteInput.dataset.excludedSite);
      chrome.storage.local.set({ excludedSites });
    });
  });

  // Live filter
  searchInput.addEventListener("input", renderCurrentList);

  // Clear log and reset badge counter
  clearLogBtn.addEventListener("click", () => {
    chrome.storage.local.set({ auditLog: [], purgeCount: 0 }, () => {
      fullLog = [];
      totalBadge.textContent = "0";
      chrome.action.setBadgeText({ text: "" });
      renderList([]);
    });
  });
});