# MasterClip website deployment

Updated 2026-11-22.

## Product split

- Company: https://anintellectualcompany.com/software/MasterClip-Tool/ is a free direct installer download. No payment flow, mockup, screenshot gallery or examples on this page.
- MasterPrompt: https://masterprompt.anintellectualcompany.com/MasterClipTool/ retains the optional INR 349 Razorpay purchase, payment recovery, and app screenshots. It links back to the free version so buyers understand the purchase does not unlock exclusive features.
- The existing INR 149 prompt product at the MasterPrompt homepage is preserved. Navigation and an introductory link lead to MasterClip.

## Source and hosting

Company source: Z:/Projects/websites/anintellectuallcompany
Cloudflare Pages project: anintellectualcompany
Build: npm run build
Deploy: npx wrangler pages deploy dist --project-name anintellectualcompany --branch main

MasterPrompt source for this change: Z:/Projects/deliverables/masterclip-sales
Cloudflare Pages project: gta-auto-clipper
Tests from site/: npm test
Deploy from repository root: npx wrangler pages deploy site --project-name gta-auto-clipper --branch main

The source branch is masterclip-page. Keep its changes in the canonical remote main before deploying older worktrees. The separate Z:/Projects/GTA-Auto-Clipper main worktree had pre-existing uncommitted changes during this task; do not overwrite or deploy that stale worktree without reconciling it.

## Assets and limits

Screenshots are actual app UI from local artifacts: installed-home.png and installed-step1.png. They illustrate template selection and live recording, not a completed output clip. There are no invented video examples.

Installer: https://github.com/AnIntellectualBeing/MasterClip/releases/download/v1.0.0/MasterClipSetup.exe

No payment secrets were changed. No real payment was made during this website update. Basic clipping needs no AI subscription; local AI is used. Links, model downloads and posting need internet. Optional Zernio and external AI costs are separate.
