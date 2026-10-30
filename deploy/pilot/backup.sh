#!/bin/sh
# A copy of the gym's data (deploy/pilot/data) as one dated file in deploy/pilot/backups,
# keeping the last 14. Run it every night from cron (README.md). Members' photos and videos
# (data/uploads) are in it too; the copy is as private as the data itself.
set -eu
cd "$(dirname "$0")"
mkdir -p backups
chmod 700 backups
stamp=$(date +%Y-%m-%d)
tar -czf "backups/cadence-data-$stamp.tar.gz" data
chmod 600 "backups/cadence-data-$stamp.tar.gz"
ls -1t backups/cadence-data-*.tar.gz | tail -n +15 | while read -r old; do rm -f -- "$old"; done
echo "backup: backups/cadence-data-$stamp.tar.gz"
