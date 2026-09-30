# ExposureBuddy

Long exposures from a burst of phone photos 📷

![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/UI-React-20232a?logo=react&logoColor=white)
![Next.js](https://img.shields.io/badge/framework-Next.js-black?logo=nextdotjs&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/styling-Tailwind%20CSS-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/installable-PWA-5A0FC8?logo=pwa&logoColor=white)
![Web Workers](https://img.shields.io/badge/compute-Web%20Workers-F7DF1E?logo=javascript&logoColor=black)
![No backend](https://img.shields.io/badge/backend-none-2ea44f)
![GitHub Pages](https://img.shields.io/badge/hosting-GitHub%20Pages-blue?logo=github)
![ESLint](https://img.shields.io/badge/lint-ESLint-4B32C3?logo=eslint&logoColor=white)
![Prettier](https://img.shields.io/badge/format-Prettier-F7B93E?logo=prettier&logoColor=white)
![SonarJS](https://img.shields.io/badge/code%20smells-SonarJS-4E9BCD?logo=sonar&logoColor=white)
![dependency-cruiser](https://img.shields.io/badge/architecture-dependency--cruiser-orange)
![Knip](https://img.shields.io/badge/dead%20code-Knip-000000?logo=knip&logoColor=white)
![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)
![fast-check](https://img.shields.io/badge/property%20tests-fast--check-8A2BE2)
![Playwright](https://custom-icon-badges.demolab.com/badge/e2e-Playwright-2EAD33?logo=playwright&logoColor=white)
![Accessibility](https://img.shields.io/badge/a11y-jsx--a11y%20%2B%20axe--core-663399)
[![Mutation testing badge](https://img.shields.io/endpoint?style=plastic&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fnobuddyorg%2FExposureBuddy%2Fmain)](https://dashboard.stryker-mutator.io/reports/github.com/nobuddyorg/ExposureBuddy/main)
[![CI](https://github.com/nobuddyorg/ExposureBuddy/actions/workflows/ci.yml/badge.svg)](https://github.com/nobuddyorg/ExposureBuddy/actions/workflows/ci.yml)
[![codecov](https://img.shields.io/codecov/c/github/nobuddyorg/ExposureBuddy?logo=codecov&logoColor=white)](https://codecov.io/gh/nobuddyorg/ExposureBuddy)
[![CodeQL](https://img.shields.io/badge/security-CodeQL-blue?logo=github)](https://github.com/nobuddyorg/ExposureBuddy/security/code-scanning)
[![Opengrep](https://img.shields.io/badge/SAST-Opengrep-blue)](https://github.com/nobuddyorg/ExposureBuddy/security/code-scanning)
![OWASP ZAP](https://img.shields.io/badge/DAST-OWASP%20ZAP-FFC933?logo=owasp&logoColor=white)
![Lighthouse CI](https://img.shields.io/badge/performance-Lighthouse%20CI-F44B21?logo=lighthouse&logoColor=white)
[![Last commit](https://img.shields.io/github/last-commit/nobuddyorg/ExposureBuddy)](https://github.com/nobuddyorg/ExposureBuddy/commits/main)
[![License: MIT](https://img.shields.io/github/license/nobuddyorg/ExposureBuddy)](LICENSE)

## Motivation

A long exposure turns a busy street into an empty one with faint ghosts of the people who walked through, and a night road into light trails. A phone camera cannot hold its shutter open for thirty seconds by hand, but it can take thirty photos in a row. ExposureBuddy takes such a burst, lines every photo up on the static scene, and stacks them: the houses come out sharp, whatever moved fades into a translucent ghost.

It runs entirely in the browser. There is no account, no upload and no server: the photos never leave the phone.

<!-- Screenshot: docs/assets/showcase.png -- a street burst, the picker with thumbnails, and the result with its three sliders. Added by the owner. -->

## Features

- **Aligns on the static scene**: ORB-style feature matching and RANSAC homographies register every photo onto the middle one, so a hand-held burst still stacks sharp.
- **Median and mean stacking**: the per-pixel median is the still scene, the mean is the long exposure; a photo that does not line up is skipped and reported, never blended in.
- **Ghosts, blur and glow**: three sliders set how visible moving things stay, how much they smear, and how much bright moving things bloom; the result re-renders live.
- **Compare, save, share**: flip between the result and one original, save the JPEG, or hand it to the phone's share sheet.
- **Runs entirely in the browser**, in Web Workers, within a memory budget that fits the device; a burst too large to combine in one go is combined in strips, and only comes out smaller when that does not fit either.
- **Installable and offline**: a PWA whose service worker stores the shell and the whole bundle (about 1 MB) on the first visit, so from then on it opens and combines without a network.
- **Bilingual, themeable**: German/English and light/dark/system, both remembered per visitor.
- Built to work with a keyboard and a screen reader, not just a touch screen.

## How it works

Every photo is decoded in a worker at a working size chosen from the burst's size and a memory budget. The middle photo is the reference: FAST corners, an intensity-centroid orientation and rotated BRIEF descriptors are computed on a grayscale copy, and a pool of workers matches every other photo against it, fits a homography with RANSAC, and warps the photo into the reference frame with a per-channel exposure gain. A stack worker keeps the aligned frames and computes, per pixel, the median, the mean and how much the pixel moved. The composite is `median + ghosts × blur(mean − median) + glow × blur(max(mean − median, 0))`, rendered in the worker on every slider change. The whole pipeline is plain TypeScript over typed arrays: [Architecture](docs/reference/architecture.md) says what exists, [Design decisions](docs/explanation/design-decisions.md) why.

## Using ExposureBuddy

- **First run**: [Getting started](docs/tutorials/getting-started.md) walks through shooting a burst, combining it, adjusting the sliders and saving the result.
- **Specific tasks**: the [user guide](docs/how-to/user-guide.md) covers shooting, output sizes, the sliders, comparing, saving and sharing, installing as an app, language, theme and keyboard use.

## Documentation

Full docs live in [`docs/`](docs/README.md), organised by [Diátaxis](https://diataxis.fr):

- **Tutorial**: [Getting started](docs/tutorials/getting-started.md)
- **How-to**: [User guide](docs/how-to/user-guide.md) · [Developer guide](docs/how-to/developer-guide.md) (checks, e2e, mutation testing, deploy)
- **Reference**: [Architecture](docs/reference/architecture.md) · [Configuration](docs/reference/configuration.md)
- **Explanation**: [Design decisions](docs/explanation/design-decisions.md)

## Contributing

ExposureBuddy is a personal hobby project and doesn't accept outside pull requests, issues or feature requests; they are closed without review. Want to change something? Fork it: [CONTRIBUTING.md](CONTRIBUTING.md) has why, local setup, and the checks CI runs.

## License

This project is licensed under the MIT License.
