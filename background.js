// Copyright (c) 2026 @fukkenawesome
// SPDX-License-Identifier: GPL-3.0-only
const MAX_LOG_SIZE = 250;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["auditLog", "purgeCount"], (res) => {
    const defaults = {};
    if (!Array.isArray(res.auditLog)) defaults.auditLog = [];
    if (!Number.isFinite(res.purgeCount)) defaults.purgeCount = 0;
    if (Object.keys(defaults).length > 0) chrome.storage.local.set(defaults);
  });
});

// Update the extension badge icon text
function updateBadge(count) {
  const text = count > 0 ? (count > 199 ? "199+" : String(count)) : "";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: "#e11d48" }); // Rose red
}

let purgeQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ITEM_PURGED") {
    purgeQueue = purgeQueue.then(() => new Promise((resolve) => {
      chrome.storage.local.get(["auditLog", "purgeCount"], (res) => {
        const currentLog = Array.isArray(res.auditLog) ? res.auditLog : [];
        const newCount = (Number.isFinite(res.purgeCount) ? res.purgeCount : 0) + 1;

        currentLog.unshift({
          id: crypto.randomUUID(),
          timestamp: new Date().toLocaleTimeString(),
          platform: message.data.platform,
          url: message.data.url,
          snippet: message.data.snippet,
          matchedTerm: message.data.matchedTerm
        });

        if (currentLog.length > MAX_LOG_SIZE) currentLog.pop();

        chrome.storage.local.set({ auditLog: currentLog, purgeCount: newCount }, () => {
          updateBadge(newCount);
          resolve();
        });
      });
    }));
  }
});