#!/usr/bin/env bash
# Ensure Docker daemon is running (nested Docker in Cloud Agent VMs).
set -euo pipefail

if docker info >/dev/null 2>&1; then
  exit 0
fi

if [[ ! -S /var/run/docker.sock ]] || ! pgrep -x dockerd >/dev/null 2>&1; then
  sudo mkdir -p /etc/docker
  if [[ ! -f /etc/docker/daemon.json ]]; then
    echo '{"storage-driver":"vfs","iptables":false}' | sudo tee /etc/docker/daemon.json >/dev/null
  fi
  sudo dockerd >/tmp/dockerd.log 2>&1 &
fi

for _ in $(seq 1 60); do
  if docker info >/dev/null 2>&1; then
    exit 0
  fi
  sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
  sleep 1
done

echo "Docker daemon did not become ready; see /tmp/dockerd.log" >&2
tail -30 /tmp/dockerd.log >&2 || true
exit 1
