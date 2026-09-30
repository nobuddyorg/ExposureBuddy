# Getting started

A first run of ExposureBuddy end to end: shoot a burst, combine it, adjust the
result and save it. Nothing to install and no account; a phone with a current
browser is enough.

## 1. Shoot a burst

Find a still scene with something moving through it: a street with people, a
square with traffic, a road at night. Brace the phone or set it down, keep the
same framing, and take 10 to 50 photos in a row. Burst mode is ideal. If your
camera app can lock focus and exposure, do that first.

## 2. Open the app

Open ExposureBuddy in the browser. The first screen is the picker, with a
short reminder of how to shoot and the footer line *Your photos never leave
this device*, which is literally true: everything that follows happens inside
the browser.

To run it from source instead, `cd web && npm install && npm run dev` from a
checkout and open `http://localhost:3000`
([CONTRIBUTING.md](../../CONTRIBUTING.md#run-it-locally)).

## 3. Pick the photos

Tap **Choose photos** and select the whole burst; on a desktop you can also
drop the files onto the dotted area. Thumbnails and a count appear. Leave
**Output size** on **Standard** for now.

Tap **Combine**. The progress screen names each stage and lists every photo
with its status: *reference* for the one the others line up on (the middle
one, unless you tapped another thumbnail), *aligned* with its match
count for the rest. A photo marked *skipped* did not line up well enough and
was left out; one or two in a hand-held burst is normal.

## 4. Look at the result

The result appears with three sliders. Drag **Ghosts** to zero: the moving
people vanish and the empty scene remains. Bring it back up and they return as
translucent ghosts. **Blur** smears them; **Glow** adds a bloom to bright
moving things, which is what makes headlights into trails.

Tap **Compare with one photo** to see the reference photo in the same frame,
and again to return to the result.

## 5. Save it

**Save image** writes a JPEG. On a phone, **Share** hands it to the share
sheet instead, so it can go straight to a chat or your photo library.

**Start over** returns to the picker for the next burst.

## 6. Make it an app

The browser can install ExposureBuddy: **Install app** in Chrome's or Edge's
menu, **Add to Home Screen** from Safari's share sheet. Installed, it opens in
its own window and works offline.

## What's next

- [User guide](../how-to/user-guide.md): each feature as a recipe, with the
  edge cases — output sizes and the memory budget, skipped photos, sharing,
  keyboard use.
- [Developer guide](../how-to/developer-guide.md) if you are working on the
  code.
- [Architecture](../reference/architecture.md) for how the pipeline aligns
  and stacks, and [Design decisions](../explanation/design-decisions.md) for
  why.
