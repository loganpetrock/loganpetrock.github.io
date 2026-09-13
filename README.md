# petrock.dev

Personal portfolio for Logan Petrock, a computer engineering student at the University of Illinois Urbana-Champaign.

The site brings together selected engineering projects, links to GitHub and LinkedIn, and a separate photography portfolio at [photography.petrock.dev](https://photography.petrock.dev/).

## Projects

Project content lives in [`projects.js`](projects.js). Each entry includes a title, date, short summary, description, technologies, and repository link when one is available. The home page uses the short summaries; [`projects/`](projects/) contains the full archive.

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

## Stack

This is a lightweight static site built with HTML, CSS, and vanilla JavaScript. It is hosted on GitHub Pages at [petrock.dev](https://petrock.dev/). The protected contact endpoint runs separately on Cloudflare Workers.

## Contact service

The contact Worker source is in [`contact-worker/`](contact-worker/). It uses Cloudflare Turnstile, rate limiting, and Resend delivery. Operational setup notes are kept in [`CONTACT-SETUP.md`](CONTACT-SETUP.md).

