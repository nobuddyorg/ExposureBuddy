# User guide

Recipes for specific tasks. New to the app? Start with
[Getting started](../tutorials/getting-started.md).

## Shoot a burst

The app lines photos up on whatever stood still, so the scene has to be the
same in every photo and something in it has to move.

- **One spot, one framing.** Brace the phone against something or use a
  tripod, and keep the same framing for the whole series. Small shakes are
  fine; a step sideways is not, because the houses then no longer line up.
- **10 to 50 photos in a row.** Burst mode is ideal. More photos make
  smoother ghosts; the app accepts up to 100 and uses the first 100 if you
  hand it more.
- **Same exposure.** Lock focus and exposure if your camera app lets you.
  Small brightness differences between photos are evened out, large ones
  show up as flicker in the ghosts.
- **A still scene with moving things.** A street with people or traffic, a
  square with a fountain, a road at night with headlights. A scene where
  everything moves (water only, a crowd filling the frame) gives the app
  nothing to line up on.

## Pick the photos

**Choose photos** opens your photo library or file chooser; on a desktop you
can also drop files onto the dotted area. Thumbnails appear as the photos are
read, with a count. **Add more** appends to the selection, **Clear** starts
again. A file that is not an image is left out and named in a notice.

**Output size** sets how large the result is: **Small, fast** (1024 px on the
long side), **Standard** (1600 px) or **Large, slow** (2400 px). A large
burst may come out smaller than you chose: the app works within a fixed
memory budget so a phone never runs out of memory, and a bigger burst means
a smaller working size. The result never comes out larger than the photos.

**Combine** starts the pipeline. It is disabled, and says how many more
photos it needs, until the burst is big enough.

## While it combines

The progress screen names the stage: reading the photos, finding features in
the reference photo (the middle one of the burst), aligning the others onto
it, stacking, rendering. Every photo has its own status line: waiting,
reference, aligned with how many matches held, skipped, or could not be read.

A **skipped** photo did not line up well enough with the reference and is
left out rather than blended in blurry; a few skips in a hand-held burst are
normal. If too few line up, the result screen is replaced by an error saying
so; **Try again** goes back to the picker.

**Cancel** stops everything and returns to the picker.

The screen stays on while the photos are combined, so the phone does not
lock half way through. Keep the app in front: a phone may pause or close a
tab in the background. Where the browser allows it, closing or reloading the
tab asks for confirmation while a burst is combining and while a result has
not been saved or shared yet; phone browsers often skip that question.

## Adjust the result

**Background** picks how the still scene is worked out from the photos; all
four are computed, so you can switch between them and compare:

- **Median** is the middle value per pixel, the classic way to drop things
  that moved.
- **Trimmed mean** averages the middle half of the values: less noise.
- **Clipped mean** averages everything close to the median and discards
  outliers.
- **Most common value** is the value most photos agree on, which copes better
  with someone standing still.

Three sliders then re-render the result live:

- **Ghosts** sets how visible moving things stay. At zero they vanish and
  you get the empty scene; at full strength the result is the plain average
  of all photos.
- **Blur** smears the ghosts, as a longer exposure would.
- **Glow** adds a bloom to bright moving things, such as headlights, for
  light trails.

A line on the result screen says how many photos were aligned out of how
many, and the result's size in pixels.

## Compare with one photo

**Compare with one photo** swaps the result for the reference photo; press it
again to go back. Use it to check that the still scene is really sharp and to
see what the ghosts came from.

## Save or share

- **Save image** writes a JPEG at the result's size to your downloads (or, on
  a phone, wherever the browser saves files); the name is shown in a notice.
- **Share** hands the JPEG to your phone's share sheet, so it can go straight
  to a chat or the photo library. Where the browser cannot share files, or
  sharing fails, the image is saved instead and the notice says so.
- **Start over** discards the result and goes back to the picker.

Nothing is stored between visits: reloading the page forgets the burst and
the result, which is why leaving asks for confirmation until the result is
saved or shared.

## Install as an app

ExposureBuddy is an installable web app. Once installed it opens in its own
window, without browser chrome. On the first visit the app stores itself on
the device (about 1 MB, including the code that does the work), so from then
on it opens and combines without a network; only the photos you pick are
needed.

- **Android (Chrome, Edge):** the browser offers **Install app** in its menu
  or as a prompt below the address bar.
- **iPhone and iPad (Safari):** Share → **Add to Home Screen**.
- **Desktop (Chrome, Edge):** the install icon at the right end of the
  address bar, or **Install ExposureBuddy** in the menu.

Updates arrive on their own: the next time you open the app with a network,
it fetches the current version.

## Language and theme

Two buttons in the header, both remembered on this device:

- **Language**: the button shows the code of the other language (`DE` or
  `EN`); pressing it switches. On first visit the app follows your browser's
  language, English if that is neither.
- **Theme**: one button cycles **System**, **Light** and **Dark**; its label
  says which is current. System follows your device setting live.

## Help

The **Help** button in the header opens a short guide: what the app does,
how to shoot, the sliders, privacy. **Ctrl+/** (**Cmd+/** on a Mac) opens it
from anywhere; **Escape** or **Close** closes it.

## Privacy

Everything runs in your browser. The photos are read into memory, combined,
and shown; nothing is uploaded, there is no account, and the only network
traffic is the app itself. The device keeps your language and theme choice
and a cached copy of the app for offline use, nothing else.

## Keyboard and screen reader

The app works with a keyboard and a screen reader. **Skip to content** is the
first thing a Tab reaches. **Choose photos** is a button that opens the file
chooser with Enter or Space. The sliders are range inputs: arrow keys move
them one step, Home and End jump to the ends, and each has a label and a
description. Every button has a name and the result image has a description.
The help dialog traps focus, closes
on Escape and returns focus to the button that opened it. A clean run of the
automated accessibility checks means "no known regression", not a compliance
claim.

## Unsupported browser

The picker shows a notice instead of the file input when the browser lacks
what the pipeline needs: Web Workers, OffscreenCanvas and image decoding
inside a worker. A current Chrome, Edge, Firefox or Safari (17 or later) has
all three.
