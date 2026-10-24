# Working on Lectio

## How to write code here

- Keep it simple and short. Prefer fewer lines and fewer files over cleverness or abstraction.
- Don't add complexity for a feature unless it clearly earns it. Ask first if a change needs a new dependency, service or download.
- Match the code around you: naming, idiom and density.
- Only comment when the code can't explain itself, such as a workaround or a surprising API. Write comments in plain English.
- Python, GTK3 and WebKit2GTK 4.1 were chosen on purpose. Omarchy already ships all three, and launch time is mostly WebKit, not Python. Don't switch stacks without measuring first.

## How to write words here

- Use plain, simple English for docs, comments, commit messages and UI text. No marketing tone and no filler.
- Keep the README short: what it is, install, translations, tests, remove. Put engineering notes here, not there.

## Before you call something done

- Run it. Check the real app, not just the tests: `python3 -m unittest discover -s tests` and `node --test tests/*.test.mjs`, then open Lectio.
- Measure visual problems before fixing them, and again after. For flicker, record the screen at 120fps and check each frame.
- Ask before pushing, publishing, or doing anything else visible outside this machine.

## Things that are easy to get wrong

- Licensed text (ESV, NLT) stays in memory only, at most 500 verses, and is never committed. Test fixtures are made-up HTML in the same shape.
- Never get licensed translations from unofficial mirrors. Use the publisher's API with the user's key.
- WebKitGTK:
  - It draws a blank frame when a CSS opacity animation ends, so fades run from JS.
  - Its first frames are black, so a GTK cover panel hides the page until the first chapter is drawn.
  - It ignores `window.close()`, so quitting is a GTK shortcut.
  - It uses fontconfig's substitute for a missing font family, so the reading font is picked in Python.
- Copy goes through `wl-copy`. The web clipboard empties when the app closes.
- NLT:
  - api.nlt.to rejects Python's default User-Agent.
  - Leave out `version=NLT` and some chapters come back in Spanish.
- ESV indents poetry with runs of `&nbsp;`, which are stripped so CSS can indent instead.
