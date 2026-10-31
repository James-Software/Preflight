#!/usr/bin/env bash
set -euo pipefail
# Linux CI bootstrap from the upstream release, verified before execution.
scan_version=8.30.1
scan_tmp=$(mktemp -d)
trap 'rm -rf "$scan_tmp"' EXIT
scan_base="https://github.com/gitleaks/gitleaks/releases/download/v${scan_version}"
scan_archive="gitleaks_${scan_version}_linux_x64.tar.gz"
curl --fail --silent --show-error --location "${scan_base}/${scan_archive}" -o "$scan_tmp/$scan_archive"
curl --fail --silent --show-error --location "${scan_base}/gitleaks_${scan_version}_checksums.txt" -o "$scan_tmp/checksums.txt"
(cd "$scan_tmp" && sha256sum --check --ignore-missing checksums.txt && tar -xzf "$scan_archive" gitleaks)
"$scan_tmp/gitleaks" git --redact=100 --no-banner --log-opts=--all .
