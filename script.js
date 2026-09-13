(() => {
  const safeURL = (value) => {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value, location.href);
      return url.protocol === "https:" ? url.href : null;
    } catch { return null; }
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (!reduced.matches && "IntersectionObserver" in window) {
    const reveals = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          reveals.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    document.querySelectorAll(".reveal").forEach(element => reveals.observe(element));
    document.body.classList.add("motion-ready");
  }
  const hero = document.querySelector(".hero");
  const navLinks = [...document.querySelectorAll('nav a[href^="#"]')];
  const sections = navLinks.map(link => document.querySelector(link.hash));
  let queued = false;
  let horizonFinished = false;
  function updateScroll() {
    queued = false;
    const progress = Math.min(1, Math.max(0, scrollY / (hero.offsetHeight * .65)));
    if (!reduced.matches) {
      const flatten = Math.min(1, progress / .8);
      hero.style.setProperty("--horizon-curve", `${(1 - flatten) * 50}%`);
      hero.style.setProperty("--horizon-rise", `${progress * 95}px`);
      hero.style.setProperty("--horizon-opacity", Math.max(0, 1 - Math.max(0, progress - .72) / .28));
    } else {
      hero.style.setProperty("--horizon-curve", "50%");
      hero.style.setProperty("--horizon-rise", "0px");
      hero.style.setProperty("--horizon-opacity", "1");
    }
    if (progress === 1) horizonFinished = true;
    let active = sections[0];
    for (const section of sections) if (section.getBoundingClientRect().top <= innerHeight * .4) active = section;
    navLinks.forEach(link => {
      if (link.hash === `#${active.id}`) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }
  function queueScroll() { if (!queued) { queued = true; requestAnimationFrame(updateScroll); } }
  addEventListener("scroll", queueScroll, { passive: true });
  addEventListener("resize", queueScroll, { passive: true });
  updateScroll();
  const light = document.querySelector(".cursor-light");
  let x = innerWidth / 2, y = innerHeight / 2, targetX = x, targetY = y, moving = false;
  function follow() {
    x += (targetX - x) * .09;
    y += (targetY - y) * .09;
    light.style.setProperty("--cursor-x", `${x}px`);
    light.style.setProperty("--cursor-y", `${y}px`);
    if (Math.abs(targetX - x) + Math.abs(targetY - y) > .4 && !reduced.matches && !document.hidden) requestAnimationFrame(follow);
    else moving = false;
  }
  addEventListener("pointermove", event => {
    if (reduced.matches || !horizonFinished || event.pointerType !== "mouse") return;
    targetX = event.clientX;
    targetY = event.clientY;
    document.body.classList.add("cursor-active");
    if (!moving) { moving = true; requestAnimationFrame(follow); }
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => document.body.classList.remove("cursor-active"));
  reduced.addEventListener("change", () => {
    document.body.classList.remove("cursor-active");
    if (reduced.matches) document.body.classList.remove("motion-ready");
    updateScroll();
  });

  const form = document.querySelector("#contact-form");
  const fields = document.querySelector("#contact-fields");
  const button = document.querySelector("#send-button");
  const status = document.querySelector("#form-status");
  const config = window.CONTACT_CONFIG || {};
  const endpoint = safeURL(config.endpoint);
  let token = "", widgetId, busy = false;
  const setStatus = (text, state = "") => { status.textContent = text; status.dataset.state = state; };
  // Always intercept submit, even before configuration is completed.
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!endpoint || !config.siteKey || busy) return;
    if (!form.reportValidity()) return;
    if (!token) { setStatus("Please complete the bot verification below the message.", "error"); return; }
    const body = Object.fromEntries(new FormData(form));
    body.token = token;
    busy = true;
    fields.disabled = true;
    button.textContent = "Sending…";
    form.setAttribute("aria-busy", "true");
    setStatus("Sending your message…");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Your message couldn’t be sent. Please try again.");
      form.reset();
      setStatus("Message sent. Thanks for reaching out — I’ll get back to you soon.", "success");
    } catch (error) {
      const message = error.name === "TimeoutError" || error instanceof TypeError
        ? "Couldn’t confirm delivery. Your message is still here; please try again in a moment."
        : error.message;
      setStatus(message, "error");
    } finally {
      busy = false;
      fields.disabled = false;
      button.textContent = "Send message ↗";
      form.removeAttribute("aria-busy");
      token = "";
      if (widgetId !== undefined) window.turnstile.reset(widgetId);
    }
  });
  if (!endpoint || !config.siteKey) return;
  fields.disabled = false;
  setStatus("Loading bot protection…");
  window.onTurnstileReady = () => {
    widgetId = window.turnstile.render("#turnstile-widget", {
      sitekey: config.siteKey, theme: "dark", action: "contact", size: "flexible",
      callback: value => { token = value; if (!busy && status.dataset.state !== "success" && status.dataset.state !== "error") setStatus("Bot verification complete."); },
      "expired-callback": () => { token = ""; setStatus("Verification expired. Please complete it again."); },
      "error-callback": () => { token = ""; setStatus("Bot protection couldn’t load. Please refresh or try again later.", "error"); },
    });
  };
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileReady&render=explicit";
  script.async = true;
  script.onerror = () => setStatus("Bot protection couldn’t load. Please refresh or try again later.", "error");
  document.head.append(script);
})();
