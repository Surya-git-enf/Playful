# Dockerfile - Godot headless + export templates
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV GODOT_VER=4.2.1-stable
ENV GODOT_BIN_NAME=Godot_v${GODOT_VER}_linux.headless.64.zip
ENV TPL_NAME=Godot_v${GODOT_VER}-stable_export_templates.tpz

# install minimal deps
RUN apt-get update -y && \
    apt-get install -y wget unzip ca-certificates libglu1-mesa && \
    rm -rf /var/lib/apt/lists/*

# create folders
RUN mkdir -p /opt/godot /root/.local/share/godot

WORKDIR /opt/godot

# download godot headless and install
RUN wget -q "https://github.com/godotengine/godot/releases/download/${GODOT_VER}/${GODOT_BIN_NAME}" -O /opt/godot/godot.zip || true && \
    unzip -q /opt/godot/godot.zip -d /opt/godot || true && \
    # find binary (unzip may produce a binary file inside)
    BIN=$(find /opt/godot -type f -perm /111 -name "Godot*" -print -quit) && \
    if [ -n "$BIN" ]; then chmod +x "$BIN" || true; mv "$BIN" /usr/local/bin/godot || cp "$BIN" /usr/local/bin/godot; fi || true

# download & install export templates
RUN wget -q "https://github.com/godotengine/godot/releases/download/${GODOT_VER}/Godot_v${GODOT_VER}_export_templates.tpz" -O /tmp/templates.tpz || true && \
    unzip -q /tmp/templates.tpz -d /root/.local/share/godot || true && \
    rm -f /tmp/templates.tpz || true

# entrypoint: pass args directly to godot
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /project
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
