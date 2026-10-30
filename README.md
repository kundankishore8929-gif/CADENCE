# CADENCE

Training programmes, workout tracking and coaching for gyms: one app for members, trainers and
gym owners. Each gym gets the app in its own name and colours.

- **Members** see today's workout from their trainer, log it, check in at the desk and follow their progress.
- **Trainers** keep their clients in one place: what they assigned, what each client did, PT sessions left, monthly consistency.
- **Gym owners** see their trainers' numbers, attendance and the members who are slipping away.

## Run it for a gym

- **The server**: [deploy/pilot/README.md](deploy/pilot/README.md), one gym on its own address with HTTPS and nightly backups.
- **The people**: [owner](docs/cadence/OWNER.md), [trainers](docs/cadence/TRAINER.md), [members](docs/cadence/MEMBER.md), and [their data](docs/cadence/PRIVACY.md).
- **The first gym**: [a 2-week pilot plan](docs/cadence/PILOT_PLAN.md).

## Built on openGym

CADENCE is a fork of [openGym](https://github.com/DuarteSantos8/openGym) by Duarte Santos, the
self-hosted gym tracker: the workout logging, progression, sync and the phone apps are his work.
For how the base app works, how to run it and how to self-host it, read
[openGym's README](https://github.com/DuarteSantos8/openGym#readme) and the guides in [docs/](docs/).

What this fork changes is kept in its own folders (`frontend/src/gym/`, `api/gym/`, `deploy/pilot/`,
`docs/cadence/`) so openGym's releases keep merging in.

## Licence

GNU AGPL v3.0, the same as openGym (see [LICENSE](LICENSE)). Anyone who uses CADENCE over a
network can get its source code: the app links to it under Settings → About.

The exercise stills and animations in `catalogue/media/` are licensed to openGym by Gym visual and
are **not** covered by the AGPL ([NOTICE.md](NOTICE.md)). CADENCE does not use them: its web image
leaves them out and the app shows each exercise's muscles instead (MIT-licensed outlines).
