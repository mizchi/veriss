#!/bin/bash
# The fonts models/text/linux-widths.json was recorded with (its "fonts" table), on an Ubuntu runner: the text-width tests
# read them from /usr/share/fonts, and the e2e compares the browsers' text against the record.
# Inter is pinned to 4.0 (Ubuntu 24.04's package), the version the record was made with: Ubuntu 26.04 ships 4.1, whose
# advances differ (a 16px "Pricing" is 0.09px narrower), and Playwright's WebKit does not run on 24.04.
set -euo pipefail
sudo apt-get update -q
sudo apt-get install -y -q --no-install-recommends fonts-crosextra-caladea fonts-crosextra-carlito fonts-jetbrains-mono \
  fonts-dejavu-core fonts-liberation fonts-freefont-ttf fonts-ipafont-gothic fonts-tlwg-loma-otf fonts-unifont fonts-opensymbol
deb=$(mktemp -d)/fonts-inter.deb
curl -fsSL -o "$deb" http://archive.ubuntu.com/ubuntu/pool/universe/f/fonts-inter/fonts-inter_4.0+ds-1_all.deb
echo "d1ca9cc3e26c347bd31977d4693bf6c371ee6b81a711e092923c8160c02e88ce  $deb" | sha256sum -c -
sudo dpkg -i "$deb"
# Firefox and WebKit ask fontconfig for the generic families; the recording machine resolved sans-serif and system-ui to Inter.
sudo cp "$(dirname "$0")/fonts.conf" /etc/fonts/local.conf
fc-cache -f >/dev/null
for f in sans-serif system-ui serif monospace; do echo "$f: $(fc-match "$f")"; done
dpkg -s fonts-inter | grep '^Version'
