/**
 * forge.js — Client-side snippet for Forge autonomous optimization.
 *
 * Drop this script on your site to let Forge's AI agents automatically
 * test different versions of your pages via PostHog feature flags.
 *
 * Usage:
 *   <script src="https://your-forge-url/forge.js"
 *           data-project="your-project-id"
 *           data-api="https://your-forge-api-url">
 *   </script>
 *
 * Annotate your HTML with data-forge attributes for reliable targeting:
 *   <h1 data-forge="headline">Original Headline</h1>
 *   <button data-forge="cta_text">Sign Up</button>
 *   <section data-forge-id="pricing">...</section>
 */
(function () {
  "use strict";

  // ── Read config from script tag ──────────────────────────────────────────
  var scriptTag = document.currentScript;
  if (!scriptTag) {
    // Fallback: find the script by src
    var scripts = document.querySelectorAll('script[data-project]');
    scriptTag = scripts[scripts.length - 1];
  }
  if (!scriptTag) return;

  var PROJECT_ID = scriptTag.getAttribute("data-project");
  var API_URL = scriptTag.getAttribute("data-api") || "";
  if (!PROJECT_ID) {
    console.warn("[forge.js] Missing data-project attribute");
    return;
  }

  // ── Notify Forge API that snippet is installed ───────────────────────────
  function pingInstalled() {
    if (!API_URL) return;
    try {
      fetch(API_URL + "/projects/" + PROJECT_ID + "/snippet-installed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch(function () {});
    } catch (e) {}
  }

  // ── DOM manipulation helpers ─────────────────────────────────────────────

  function setText(selector, value) {
    if (typeof value !== "string") return;
    var els = document.querySelectorAll(selector);
    els.forEach(function (el) {
      el.textContent = value;
    });
  }

  function setVisibility(selector, visible) {
    var els = document.querySelectorAll(selector);
    els.forEach(function (el) {
      el.style.display = visible ? "" : "none";
    });
  }

  function setListItems(selector, items) {
    if (!Array.isArray(items)) return;
    var container = document.querySelector(selector);
    if (!container) return;
    var children = Array.from(container.children);
    items.forEach(function (text, i) {
      if (children[i]) {
        children[i].textContent = text;
      }
    });
    // Hide extra children beyond the new list length
    for (var i = items.length; i < children.length; i++) {
      children[i].style.display = "none";
    }
  }

  function reorderChildren(selector, newOrder) {
    if (!Array.isArray(newOrder)) return;
    var container = document.querySelector(selector);
    if (!container) return;
    var children = Array.from(container.children);
    var ordered = [];
    newOrder.forEach(function (key) {
      var child = children.find(function (c) {
        return (
          c.getAttribute("data-forge-id") === key ||
          c.getAttribute("data-section") === key ||
          c.getAttribute("data-forge-step") === key ||
          c.getAttribute("data-forge-plan") === key ||
          c.id === key
        );
      });
      if (child) ordered.push(child);
    });
    // Append in new order (moves existing DOM nodes)
    ordered.forEach(function (child) {
      container.appendChild(child);
    });
  }

  function swapClass(selector, prefix, value) {
    var els = document.querySelectorAll(selector);
    els.forEach(function (el) {
      // Remove existing forge-prefixed classes
      Array.from(el.classList).forEach(function (cls) {
        if (cls.indexOf("forge-") === 0) el.classList.remove(cls);
      });
      el.classList.add("forge-" + value);
    });
  }

  function highlightPlan(selector, planName) {
    var els = document.querySelectorAll(selector);
    els.forEach(function (el) {
      var plan = el.getAttribute("data-forge-plan");
      if (plan === planName) {
        el.classList.add("forge-highlighted");
      } else {
        el.classList.remove("forge-highlighted");
      }
    });
  }

  function setNestedText(selector, valueDict) {
    // e.g. cta_text: {"free": "Get Started", "pro": "Try Free"}
    if (typeof valueDict !== "object" || valueDict === null) return;
    Object.keys(valueDict).forEach(function (key) {
      var el = document.querySelector(
        selector + '[data-plan="' + key + '"]'
      );
      if (el) el.textContent = valueDict[key];
    });
  }

  // ── Apply config based on template type ──────────────────────────────────

  function applyConfig(config, selectors, templateType) {
    if (!config || !selectors) return;

    Object.keys(config).forEach(function (field) {
      var value = config[field];
      var selector = selectors[field];
      if (!selector) return;

      // Detect field type and apply appropriately
      if (typeof value === "string") {
        setText(selector, value);
      } else if (typeof value === "boolean") {
        setVisibility(selector, value);
      } else if (
        Array.isArray(value) &&
        (field.endsWith("_order") ||
          field === "sections_order" ||
          field === "steps_order" ||
          field === "plans_order")
      ) {
        reorderChildren(selector, value);
      } else if (Array.isArray(value)) {
        setListItems(selector, value);
      } else if (typeof value === "object" && value !== null) {
        setNestedText(selector, value);
      } else if (typeof value === "number") {
        // Numeric fields like auto_show_delay — skip DOM changes
        return;
      }

      // Special field handling
      if (
        field === "hero_style" ||
        field === "cta_style" ||
        field === "social_proof_style" ||
        field === "feature_position"
      ) {
        swapClass(selector, "forge-", value);
      }
      if (field === "highlighted_plan") {
        highlightPlan(selectors["plans_order"] || selector, value);
      }
    });
  }

  // ── PostHog integration ──────────────────────────────────────────────────

  function waitForPostHog(callback, maxWaitMs) {
    var elapsed = 0;
    var interval = 100;
    var timer = setInterval(function () {
      if (window.posthog && typeof window.posthog.onFeatureFlags === "function") {
        clearInterval(timer);
        callback(window.posthog);
      } else {
        elapsed += interval;
        if (elapsed >= (maxWaitMs || 10000)) {
          clearInterval(timer);
          console.warn("[forge.js] PostHog not found after " + elapsed + "ms");
        }
      }
    }, interval);
  }

  function readFlagAndApply(posthog) {
    var flagKey = "forge-" + PROJECT_ID;

    posthog.onFeatureFlags(function () {
      try {
        var payload = posthog.getFeatureFlagPayload(flagKey);
        if (!payload) {
          // No active forge flag for this project
          return;
        }

        var config = payload.config;
        var selectors = payload.selectors;
        var templateType = payload.template_type;

        if (!config) {
          console.warn("[forge.js] Flag payload missing config");
          return;
        }

        applyConfig(config, selectors, templateType);
        console.log("[forge.js] Applied variant for " + flagKey);
      } catch (e) {
        console.error("[forge.js] Error applying config:", e);
      }
    });
  }

  // ── Initialize ───────────────────────────────────────────────────────────

  function init() {
    pingInstalled();
    waitForPostHog(readFlagAndApply, 10000);
  }

  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
