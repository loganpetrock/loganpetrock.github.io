# petrock.dev

A build-free personal site for GitHub Pages. Home, projects, photography, and contact share one page with anchored navigation.

## Preview

Open `index.html` in your browser, or, with Node.js installed, run:

```sh
node scripts/preview.mjs
```

Then open http://localhost:4173. The contact form is intentionally unavailable until you finish `CONTACT-SETUP.md`.

## Add a project

1. Open `projects.js`.
2. Copy an existing entry inside `window.PROJECTS = [ ... ]`.
3. Replace its values with your new project's details.
4. Save and refresh. The empty state is automatically replaced by project rows.

```js
window.PROJECTS = [
  {
    title: "My project",
    description: "What I built and why it is useful.",
    technologies: ["C++", "Python"],
    github: "https://github.com/loganpetrock/REPLACE-WITH-REPO",
    demo: "",
    image: "",
    imageAlt: "",
  },
];
```

Add more `{ ... },` entries to list more projects. Order in this file is display order. `demo`, `image`, and `imageAlt` are optional. Put images in `assets/` and use `image: "assets/my-project.jpg"`. Use HTTPS for external URLs. Write a useful image description in `imageAlt`. Plain text is rendered safely; HTML in descriptions is not supported. Escape a quotation mark within quoted text as `\"`.

## Edit the site

- `index.html`: name, bio, links, photography feature, and contact markup.
- `styles.css`: colors, type, spacing, responsive layouts, motion styles.
- `script.js`: project rendering, scroll animation, navigation, contact submission.
- `projects.js`: your project entries.
- `contact-config.js`: public contact endpoint and Turnstile site key.
- `contact-worker/`: protected contact backend, deployed separately to Cloudflare.
- `CONTACT-SETUP.md`: complete activation steps.

The photography image is your August 20, 2026 moon photograph. To swap it, replace `assets/moon.jpg` and update the alt text, dimensions, and caption in `index.html`. The portfolio remains at https://photography.petrock.dev/.

## Publish on GitHub Pages

Copy the updated files to the `main` branch of `loganpetrock/loganpetrock.github.io`, preserving `CNAME` (`petrock.dev`). No npm build is required. Keep Pages configured for the root of `main`. `_config.yml` excludes backend source, documentation, and tests from the Jekyll Pages output. If you instead use a custom Pages workflow, explicitly exclude those directories from its artifact.

The canonical domain remains `petrock.dev`. If `www.petrock.dev` is already configured, preserve its DNS redirect/alias; this redesign does not change DNS. This local folder is not a Git checkout, and the redesigned site has not been pushed or deployed.

## Checks

```sh
node --check script.js
node --test tests/contact.test.mjs
```

Motion respects reduced-motion preferences. Navigation and external links work without JavaScript. Project entries and the protected form require JavaScript. The cursor glow only runs after the first scroll transition, only for a mouse, and stops scheduling frames once it settles.

