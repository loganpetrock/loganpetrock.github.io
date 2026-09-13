(() => {
  "use strict";
  const create = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const safeURL = (value, local = false) => {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value, location.href);
      return url.protocol === "https:" || (local && url.origin === location.origin) ? url.href : null;
    } catch { return null; }
  };
  const projects = Array.isArray(window.PROJECTS) ? window.PROJECTS : [];
  const list = document.querySelector("#project-list");
  const compact = list.dataset.view === "compact";
  const validProjects = projects.filter(p => p && typeof p.title === "string" && p.title.trim());
  (compact ? validProjects.slice(0, 3) : validProjects).forEach((project, index) => {
    const id = project.id || `project-${index + 1}`;
    if (compact) {
      const row = create("a", "project-summary", "");
      row.href = `/projects/#${encodeURIComponent(id)}`;
      row.append(create("span", "project-date", project.date || ""));
      const text = create("div", "");
      text.append(create("h3", "", project.title), create("p", "", project.summary || ""));
      row.append(text, create("span", "summary-arrow", "↗"));
      list.append(row);
      return;
    }
    const card = create("article", "project-card reveal");
    card.id = id;
    card.append(create("span", "project-number", String(index + 1).padStart(2, "0")));
    const content = create("div", "project-content");
    content.append(create("p", "project-date", project.date || ""), create("h2", "", project.title), create("p", "", project.description || ""));
    if (Array.isArray(project.details) && project.details.length) {
      const details = create("ul", "project-details");
      project.details.forEach(detail => details.append(create("li", "", detail)));
      content.append(details);
    }
    const tags = create("div", "project-tags");
    (Array.isArray(project.technologies) ? project.technologies : []).forEach(tag => tags.append(create("span", "", String(tag))));
    content.append(tags);
    const imageURL = safeURL(project.image, true);
    if (imageURL) {
      const image = create("img", "project-image");
      image.src = imageURL;
      image.alt = project.imageAlt || project.title;
      image.loading = "lazy";
      content.append(image);
    }
    card.append(content);
    const links = create("div", "project-links");
    [["GitHub", project.github], ["Live demo", project.demo]].forEach(([label, value]) => {
      const url = safeURL(value);
      if (!url) return;
      const link = create("a", "text-link", `${label} ↗`);
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", `${project.title}: ${label}`);
      links.append(link);
    });
    card.append(links);
    list.append(card);
  });
  document.querySelector("#projects-empty").hidden = list.children.length > 0;
  document.querySelector("#year").textContent = new Date().getFullYear();
  if (!compact && location.hash) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) requestAnimationFrame(() => target.scrollIntoView());
  }


})();
