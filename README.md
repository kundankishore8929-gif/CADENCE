# CADENCE

Training programmes, workout tracking and coaching for gyms: one app for members, trainers and
gym owners. Each gym gets the app in its own name and colours.

- **Members** see today's workout from their trainer, log it, check in at the desk and follow their progress.
- **Trainers** keep their clients in one place: what they assigned, what each client did, PT sessions left, monthly consistency.
- **Gym owners** see their trainers' numbers, attendance and the members who are slipping away.

The gym features are being built in stages; the plan is in the project spec.

## Built on openGym

CADENCE is a fork of [openGym](https://github.com/DuarteSantos8/openGym) by Duarte Santos, the
self-hosted gym tracker: the workout logging, progression, sync and the phone apps are his work.
For how the base app works, how to run it and how to self-host it, read
[openGym's README](https://github.com/DuarteSantos8/openGym#readme) and the guides in [docs/](docs/).

What this fork changes is kept in its own folders (`frontend/src/gym/`, later `api/gym/`) so
openGym's releases keep merging in.

## Licence

GNU AGPL v3.0, the same as openGym (see [LICENSE](LICENSE)). Anyone who uses CADENCE over a
network can get its source code: the app links to it under Settings → About.

The exercise animations in `catalogue/media/` are licensed to openGym by Gym visual and are **not**
covered by the AGPL. They must be replaced before CADENCE is offered to any gym; see
[NOTICE.md](NOTICE.md).
