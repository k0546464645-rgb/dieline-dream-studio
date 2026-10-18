<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Product-free idea mockups use an authenticated streaming image route; background removal uses the existing edit route with server-owned preservation and transparency settings, keeping prompts and credentials off the client.
- Idea-to-project conversion stores product images and mockups in project_files and style directions in projects.style_notes so the existing studio restores and reuses them.
- Appearance preferences use semantic CSS tokens and a versioned one-time palette reset; later designer choices remain persisted per device.
- Studio mockup slots are derived from packaging request counts; each optional image has its own project_files kind, preserving the canonical front/back images for artwork reuse.
