(() => {
 const track=(name,properties)=>window.CodevalancheAnalytics?.track(name,properties);
 const featureIds={workspace:'project',runtime:'agents',review:'review',local:'local_first'};
        document.querySelectorAll(".feature-tab").forEach((button) => {
          button.addEventListener("click", () => { const feature = button.getAttribute("data-feature"); document.querySelectorAll(".feature-tab").forEach((item) => { const active = item === button; item.classList.toggle("is-active", active); item.setAttribute("aria-selected", String(active)) }); document.querySelectorAll(".feature-panel").forEach((panel) => { panel.hidden = panel.getAttribute("data-panel") !== feature; panel.classList.toggle("is-active", panel.getAttribute("data-panel") === feature) }); const featureId=featureIds[feature]; if (featureId) track("feature_selected", { feature_id: featureId, selection_id: featureId }) })
          button.addEventListener("keydown", (event) => { if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return; const buttons = [...document.querySelectorAll(".feature-tab")]; const index = buttons.indexOf(button); const forward = event.key === "ArrowDown" || event.key === "ArrowRight"; const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (forward ? 1 : -1) + buttons.length) % buttons.length; event.preventDefault(); buttons[next]?.focus(); buttons[next]?.click() })
        })
        const mobileNav = document.querySelector(".mobile-nav")
        mobileNav?.querySelectorAll(".mobile-nav-panel a").forEach((link) => link.addEventListener("click", () => mobileNav.removeAttribute("open")))
        const langPicker = document.querySelector(".lang-picker")
        document.addEventListener("click", (event) => {
          const link = event.target.closest?.("a[data-locale]")
          const locale = link?.dataset.locale
          if (!locale || !/^(en|ar|de|es|fr|hi|id|it|ja|ko|pt-br|ro|ru|tr|vi|zh-hans|zh-hant)$/.test(locale)) return
          const secure = location.protocol === "https:" ? "; Secure" : ""
          try { document.cookie = `codevalanche_language=${encodeURIComponent(locale)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}` } catch {}
        })
        document.addEventListener("click", (event) => {
          if (mobileNav?.hasAttribute("open") && !mobileNav.contains(event.target)) mobileNav.removeAttribute("open")
          if (langPicker?.hasAttribute("open") && !langPicker.contains(event.target)) langPicker.removeAttribute("open")
        })
        const fine = window.matchMedia("(pointer: fine)").matches
        if (fine) document.querySelectorAll(".spot").forEach((card) => {
          card.addEventListener("pointermove", (event) => { const rect = card.getBoundingClientRect(); card.style.setProperty("--mx", `${event.clientX - rect.left}px`); card.style.setProperty("--my", `${event.clientY - rect.top}px`) })
        })
        const THEME_KEY = "codevalanche_theme"
        const themeToggle = document.querySelector("[data-theme-toggle]")
        const applyTheme = (theme, persist) => {
          document.documentElement.setAttribute("data-theme", theme)
          if (persist) { try { localStorage.setItem(THEME_KEY, theme) } catch {} }
          const themeLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
          themeToggle?.setAttribute("aria-label", window.CodevalancheLocale?.translate(themeLabel) ?? themeLabel)
          document.querySelector("meta[name='theme-color']")?.setAttribute("content", theme === "dark" ? "#07090b" : "#f7f9fa")
          window.dispatchEvent(new CustomEvent("codevalanche-theme"))
        }
        themeToggle?.addEventListener("click", () => { const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; applyTheme(next, true) })
        const lightQuery = window.matchMedia("(prefers-color-scheme: light)")
        lightQuery.addEventListener?.("change", () => { try { if (!localStorage.getItem(THEME_KEY)) applyTheme(lightQuery.matches ? "light" : "dark", false) } catch {} })
        window.addEventListener("codevalanche-locale-ready", () => applyTheme(document.documentElement.getAttribute("data-theme") || "dark", false))
        applyTheme(document.documentElement.getAttribute("data-theme") || "dark", false)
      })()

// Optional telemetry cannot delay control initialization or fail its module graph.
void import('./account-funnel.js').catch(() => { /* Browsing remains usable without analytics. */ });
