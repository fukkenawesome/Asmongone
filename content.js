// Copyright (c) 2026 @fukkenawesome
// SPDX-License-Identifier: GPL-3.0-only
(() => {
  "use strict";

  const BLOCK_REGEX = /\b(asmongold247|asmongold|zackrawrr|otk|one\s*true\s*king|indestructible|o[lI]ympus\s*guilds?|steak\s*and\s*eggs\s*podcast)\b/i;
  const BYPASS_PARAMETER = "asmongone_unfiltered";

  if (new URLSearchParams(window.location.search).has(BYPASS_PARAMETER)) return;

  const DOMAIN_SELECTORS = {
    "youtube.com": [
      "ytd-rich-item-renderer",
      "ytd-video-renderer",
      "ytd-compact-video-renderer",
      "yt-lockup-view-model",
      "ytd-reel-item-renderer",
      "yt-shorts-lockup-view-model",
      "ytm-shorts-lockup-view-model"
    ],
    "twitch.tv": [
      ".side-nav-card",
      'div[data-a-target="search-result-live-channel"]',
      'article[data-test-selector="stream-card"]',
      'div[data-target="directory-card"]',
      'div[data-target="directory-container"] article'
    ],
    "reddit.com": [
      'div[data-id^="search-media-post"]',
      'div[data-testid^="search-post"]',
      "shreddit-post",
      'div[data-testid="post-container"]',
      "div.thing"
    ],
    "x.com": [
      'article[data-testid="tweet"]',
      'div[data-testid="cellInnerDiv"]'
    ],
    "twitter.com": [
      'article[data-testid="tweet"]',
      'div[data-testid="cellInnerDiv"]'
    ]
  };

  const activeHostname = window.location.hostname;
  const matchedDomain = Object.keys(DOMAIN_SELECTORS).find((domain) =>
    activeHostname === domain || activeHostname.endsWith(`.${domain}`)
  );
  const activeSite = matchedDomain === "twitter.com" ? "x.com" : matchedDomain;
  const currentSelectors = matchedDomain ? DOMAIN_SELECTORS[matchedDomain] : [];

  if (currentSelectors.length === 0) return;

  const selectorQuery = currentSelectors.join(", ");
  const pendingNodes = new Set();
  let isBatchScheduled = false;
  let isFiltering = false;
  let observer = null;
  let preferenceChanged = false;

  function findBlockedTerm(element) {
    let searchableText = element.textContent || "";
    searchableText += ` ${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`;

    element.querySelectorAll("[aria-label], [title]").forEach((child) => {
      searchableText += ` ${child.getAttribute("aria-label") || ""} ${child.getAttribute("title") || ""}`;
    });

    return searchableText.match(BLOCK_REGEX);
  }

  function findSourceLink(element) {
    if (activeHostname.endsWith("x.com") || activeHostname.endsWith("twitter.com")) {
      const postLink = Array.from(element.querySelectorAll('a[href*="/status/"], a[href*="/statuses/"]'))
        .find((link) => {
          const url = new URL(link.href);
          const isXHost = url.hostname === "x.com" || url.hostname.endsWith(".x.com");
          const isTwitterHost = url.hostname === "twitter.com" || url.hostname.endsWith(".twitter.com");
          return (isXHost || isTwitterHost) && /\/(?:[^/]+\/)?status(?:es)?\/\d+(?:\/|$)/.test(url.pathname);
        });

      if (postLink) return postLink.href;
    }

    return element.querySelector("a[href]")?.href || window.location.href;
  }

  function reportPurge(element, matchedText) {
    const rawText = (element.textContent || "").replace(/\s+/g, " ").trim();
    const snippet = rawText.length > 220 ? rawText.substring(0, 220) + "..." : rawText;
    const sourceLink = findSourceLink(element);
   

    try {
      chrome.runtime.sendMessage({
        type: "ITEM_PURGED",
        data: {
          platform: activeHostname.replace("www.", ""),
          url: sourceLink,
          snippet: snippet,
          matchedTerm: matchedText
        }
      });
    } catch (e) {
      // Extension context invalidated during update/reload
    }
  }

  function inspectAndPurge(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;

    if (element.matches && element.matches(selectorQuery)) {
      const match = findBlockedTerm(element);
      if (match) {
        reportPurge(element, match[0]);
        element.remove();
        return;
      }
    }

    const matches = element.querySelectorAll?.(selectorQuery) || [];
    for (let i = 0; i < matches.length; i++) {
      const card = matches[i];
      const match = findBlockedTerm(card);
      if (match) {
        reportPurge(card, match[0]);
        card.remove();
      }
    }
  }

  function processQueue() {
    if (!isFiltering) {
      pendingNodes.clear();
      isBatchScheduled = false;
      return;
    }

    pendingNodes.forEach((node) => {
      if (node.isConnected) inspectAndPurge(node);
    });
    pendingNodes.clear();
    isBatchScheduled = false;
  }

  function scheduleBatch() {
    if (isBatchScheduled) return;
    isBatchScheduled = true;
    if (window.requestIdleCallback) {
      window.requestIdleCallback(processQueue, { timeout: 100 });
    } else {
      window.requestAnimationFrame(processQueue);
    }
  }

  function initialSweep() {
    if (!isFiltering) return;

    document.querySelectorAll(selectorQuery).forEach((card) => {
      const match = findBlockedTerm(card);
      if (match) {
        reportPurge(card, match[0]);
        card.remove();
      }
    });
  }

  function startFiltering() {
    if (isFiltering) return;
    isFiltering = true;

    observer = new MutationObserver((mutations) => {
      if (!isFiltering) return;

      for (let i = 0; i < mutations.length; i++) {
        const added = mutations[i].addedNodes;
        for (let j = 0; j < added.length; j++) {
          if (added[j].nodeType === Node.ELEMENT_NODE) {
            pendingNodes.add(added[j]);
          }
        }
      }
      if (pendingNodes.size > 0) scheduleBatch();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    initialSweep();
  }

  function stopFiltering() {
    isFiltering = false;
    observer?.disconnect();
    observer = null;
    pendingNodes.clear();
    isBatchScheduled = false;
  }

  function applyExcludedSites(excludedSites) {
    if (excludedSites.includes(activeSite)) {
      stopFiltering();
    } else {
      startFiltering();
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !Array.isArray(changes.excludedSites?.newValue)) return;

    preferenceChanged = true;
    applyExcludedSites(changes.excludedSites.newValue);
  });

  chrome.storage.local.get(["excludedSites"], (res) => {
    if (preferenceChanged) return;
    applyExcludedSites(Array.isArray(res.excludedSites) ? res.excludedSites : []);
  });
})();