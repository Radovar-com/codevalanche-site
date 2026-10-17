(() => {
 const track=(name,properties)=>window.CodevalancheAnalytics?.track(name,properties);
 const featureIds={brief:'task_brief',execution:'task_execution',approval:'command_approval',review:'review'};
        document.querySelectorAll('.feature-tabs').forEach(group => {
          const buttons = [...group.querySelectorAll('.feature-tab')];
          const panels = buttons.map(button => document.getElementById(button.getAttribute('aria-controls')));
          buttons.forEach(button => {
            button.addEventListener('click', () => {
              const changed = button.getAttribute('aria-selected') !== 'true';
              buttons.forEach((item, index) => {
                const active = item === button;
                item.classList.toggle('is-active', active);
                item.setAttribute('aria-selected', String(active));
                item.tabIndex = active ? 0 : -1;
                if (panels[index]) {
                  panels[index].hidden = !active;
                  panels[index].classList.toggle('is-active', active);
                }
              });
              const featureId = featureIds[button.dataset.feature];
              if (changed && featureId) track('feature_selected', {feature_id:featureId, selection_id:featureId});
            });
            button.addEventListener('keydown', event => {
              const vertical = group.getAttribute('aria-orientation') === 'vertical';
              const arrows = vertical ? ['ArrowUp','ArrowDown'] : ['ArrowLeft','ArrowRight'];
              if (!['Home','End',...arrows].includes(event.key)) return;
              const rtl = getComputedStyle(group).direction === 'rtl';
              const forward = event.key === (vertical ? 'ArrowDown' : rtl ? 'ArrowLeft' : 'ArrowRight');
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
                : (buttons.indexOf(button) + (forward ? 1 : -1) + buttons.length) % buttons.length;
              event.preventDefault();
              buttons[next]?.focus();
              buttons[next]?.click();
            });
          });
        });
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
        document.addEventListener("keydown", (event) => {
          if (event.key !== "Escape") return
          for (const open of [mobileNav, langPicker]) if (open?.hasAttribute("open")) { open.removeAttribute("open"); open.querySelector("summary")?.focus() }
        })
        const header = document.querySelector(".site-header")
        const onScroll = () => header?.classList.toggle("is-scrolled", window.scrollY > 8)
        window.addEventListener("scroll", onScroll, { passive: true }); onScroll()
        const THEME_KEY = "codevalanche_theme"
        const themeToggle = document.querySelector("[data-theme-toggle]")
        const applyTheme = (theme, persist) => {
          document.documentElement.setAttribute("data-theme", theme)
          if (persist) { try { localStorage.setItem(THEME_KEY, theme) } catch {} }
          const themeLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
          themeToggle?.setAttribute("aria-label", window.CodevalancheLocale?.translate(themeLabel) ?? themeLabel)
          document.querySelector("meta[name='theme-color']")?.setAttribute("content", theme === "dark" ? "#12120f" : "#faf9f5")
          window.dispatchEvent(new CustomEvent("codevalanche-theme"))
        }
        themeToggle?.addEventListener("click", () => { const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; applyTheme(next, true) })
        const darkQuery = window.matchMedia("(prefers-color-scheme: dark)")
        darkQuery.addEventListener?.("change", () => { try { if (!localStorage.getItem(THEME_KEY)) applyTheme(darkQuery.matches ? "dark" : "light", false) } catch {} })
        window.addEventListener("codevalanche-locale-ready", () => applyTheme(document.documentElement.getAttribute("data-theme") || "light", false))
        applyTheme(document.documentElement.getAttribute("data-theme") || "light", false)

        // ---- Motion: reveal on scroll and contour lines, only when the visitor allows motion ----
        const motionOk = window.matchMedia("(prefers-reduced-motion: no-preference)").matches
        const revealed = document.querySelectorAll(".reveal")
        if (motionOk && "IntersectionObserver" in window) {
          document.documentElement.classList.add("motion")
          const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-in"); observer.unobserve(entry.target) } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 })
          revealed.forEach((element) => observer.observe(element))
        } else revealed.forEach((element) => element.classList.add("is-in"))
        const svgNs = "http://www.w3.org/2000/svg"
        document.querySelectorAll("[data-terrain]").forEach((host) => {
          const svg = document.createElementNS(svgNs, "svg")
          svg.setAttribute("class", "terrain"); svg.setAttribute("viewBox", "0 0 1200 520"); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("aria-hidden", "true")
          for (let i = 0; i < 9; i++) {
            const path = document.createElementNS(svgNs, "path")
            path.setAttribute("d", `M0 ${150 + i * 42} C 180 ${90 + i * 40}, 300 ${230 + i * 34}, 520 ${150 + i * 38} S 860 ${60 + i * 46}, 1200 ${130 + i * 40}`)
            svg.append(path)
          }
          host.prepend(svg)
        })

        // ---- Footer particle canvas ----
        const canvas = document.querySelector("#footer-canvas")
        const wrap = canvas ? canvas.parentElement : null
        if (canvas && wrap && motionOk) {
          const ctx = canvas.getContext("2d")
          let particles = []
          let raf = 0
          let running = false
          let particleRgb = "11, 86, 97"
          const pointer = { x: -9999, y: -9999 }
          const build = () => {
            particleRgb = (getComputedStyle(document.documentElement).getPropertyValue("--particle-rgb") || "").trim() || "11, 86, 97"
            const w = wrap.clientWidth
            const h = wrap.clientHeight
            if (w < 480 || h < 120) { particles = []; wrap.classList.remove("canvas-on"); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); return }
            wrap.classList.add("canvas-on")
            const dpr = Math.min(window.devicePixelRatio || 1, 2)
            canvas.width = w * dpr
            canvas.height = h * dpr
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            const off = document.createElement("canvas")
            off.width = w
            off.height = h
            const octx = off.getContext("2d")
            const lines = ["Agents.", "One home."].map((line) => window.CodevalancheLocale?.translate(line) ?? line)
            const rtl = getComputedStyle(wrap).direction === "rtl"
            octx.direction = rtl ? "rtl" : "ltr"
            octx.textAlign = rtl ? "right" : "left"
            let size = Math.floor(h / 2.6)
            octx.textBaseline = "alphabetic"
            const fontFor = (s) => `300 ${s}px Newsreader, Georgia, serif`
            octx.font = fontFor(size)
            const widest = Math.max(...lines.map((l) => octx.measureText(l).width))
            if (widest > w - 24) { size = Math.floor(size * ((w - 24) / widest)); octx.font = fontFor(size) }
            const lineGap = Math.round(size * 1.02)
            const startY = Math.round((h - lineGap * (lines.length - 1) + size * 0.62) / 2)
            octx.fillStyle = "#fff"
            lines.forEach((line, i) => octx.fillText(line, rtl ? w - 6 : 6, startY + i * lineGap))
            const gap = Math.max(3, Math.round(size / 26))
            const data = octx.getImageData(0, 0, w, h).data
            particles = []
            for (let y = 0; y < h; y += gap) {
              for (let x = 0; x < w; x += gap) {
                if (data[(y * w + x) * 4 + 3] > 140) {
                  particles.push({ x: Math.random() * w, y: Math.random() * h, tx: x, ty: y, vx: 0, vy: 0, r: gap * (0.3 + Math.random() * 0.14), a: 0.5 + Math.random() * 0.45 })
                }
              }
            }
          }
          const step = () => {
            if (!running) return
            const w = wrap.clientWidth
            const h = wrap.clientHeight
            ctx.clearRect(0, 0, w, h)
            for (const p of particles) {
              const dx = p.tx - p.x
              const dy = p.ty - p.y
              p.vx += dx * 0.045
              p.vy += dy * 0.045
              const px = p.x - pointer.x
              const py = p.y - pointer.y
              const dist2 = px * px + py * py
              if (dist2 < 8100) {
                const dist = Math.sqrt(dist2) || 1
                const force = (90 - dist) / 90
                p.vx += (px / dist) * force * 4.2
                p.vy += (py / dist) * force * 4.2
              }
              p.vx *= 0.82
              p.vy *= 0.82
              p.x += p.vx
              p.y += p.vy
              ctx.beginPath()
              ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
              ctx.fillStyle = `rgba(${particleRgb}, ${p.a})`
              ctx.fill()
            }
            raf = requestAnimationFrame(step)
          }
          const start = () => { if (!running && particles.length) { running = true; raf = requestAnimationFrame(step) } }
          const stop = () => { running = false; cancelAnimationFrame(raf) }
          document.fonts?.ready.then(build).catch(build)
          build()
          let resizeTimer = 0
          window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { build(); if (running) { stop(); start() } }, 180) })
          window.addEventListener("codevalanche-theme", () => build())
          window.addEventListener("codevalanche-locale-ready", () => build())
          wrap.addEventListener("pointermove", (event) => { const rect = canvas.getBoundingClientRect(); pointer.x = event.clientX - rect.left; pointer.y = event.clientY - rect.top })
          wrap.addEventListener("pointerleave", () => { pointer.x = -9999; pointer.y = -9999 })
          if ("IntersectionObserver" in window) {
            new IntersectionObserver((entries) => entries.forEach((entry) => (entry.isIntersecting ? start() : stop())), { threshold: 0.08 }).observe(wrap)
          } else {
            start()
          }
        }
      })()

// Optional telemetry cannot delay control initialization or fail its module graph.
void import('./account-funnel.js').catch(() => { /* Browsing remains usable without analytics. */ });
