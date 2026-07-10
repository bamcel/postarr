#!/bin/sh
# Runs as root just long enough to make /data writable by the postarr user,
# then drops privileges for the actual app process.
#
# The image bakes in ownership of /data at build time (see Dockerfile), which
# is enough for a Docker-managed named volume (docker-compose's postarr-data)
# since Docker copies that ownership over on first creation. It's NOT enough
# for a bind mount to a host path (e.g. Unraid's Path config, which maps to a
# folder Unraid creates as root) — bind mounts always reflect the host
# directory's own ownership, ignoring whatever the image had. Fixing it here,
# at container start, works for both cases.
set -e

mkdir -p /data
chown -R postarr:postarr /data

exec setpriv --reuid=10001 --regid=10001 --init-groups "$@"
