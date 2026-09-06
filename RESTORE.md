# RESTORE — mengacci-app

This is a deploy target, not a project. It holds the six page files that GitHub
Pages serves at https://kvander369.github.io/mengacci-app/ and nothing else.

Everything needed to restore it lives in the private working repo
`kvander369/mengacci` (folder `..\mengacci`): the source in `app/`, the rules,
the design, the tests and `deploy.js`. To rebuild this repo from nothing: clone
it empty beside `mengacci`, then run `node deploy.js` there. GitHub Pages is
switched on in this repo's settings (branch `main`, path `/`).

No names, scores or credentials are ever committed here. Do not edit files here
by hand; they are overwritten by the next deploy.
