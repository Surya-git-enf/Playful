# Dockerfile - Godot headless + export templates (stable, single-file)
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV GODOT_VER=4.2.1-stable
ENV GODOT_ZIP=Godot_v${GODOT_VER}_linux.headless.64.zip
ENV TPL_ZIP=Godot_v${GODOT_VER}_export_templates.tpz

# Install required packages
RUN apt-get update -y && \
    apt-get install -y wget unzip ca-certificates libglu1-mesa && \
    rm -rf /var/lib/apt/lists/*

# Prepare directories
RUN mkdir -p /opt/godot /root/.local/share/godot

WORKDIR /opt/godot

# Download Godot headless and install binary
RUN wget -q "https://github.com/godotengine/godot/releases/download/${GODOT_VER}/${GODOT_ZIP}" -O /opt/godot/godot.zip || true && \
    unzip -q /opt/godot/godot.zip -d /opt/godot || true && \
    BIN=$(find /opt/godot -type f -perm /111 -name "Godot*" -print -quit || true) && \
    if [ -n "$BIN" ]; then chmod +x "$BIN" || true; mv "$BIN" /usr/local/bin/godot || cp "$BIN" /usr/local/bin/godot; fi || true

# Download & install export templates (matching version)
RUN wget -q "https://github.com/godotengine/godot/releases/download/${GODOT_VER}/${TPL_ZIP}" -O /tmp/templates.tpz || true && \
    unzip -q /tmp/templates.tpz -d /root/.local/share/godot || true && \
    # move nested templates if necessary
    if [ -d /root/.local/share/godot/templates ]; then mv /root/.local/share/godot/templates/* /root/.local/share/godot/ || true; fi && \
    rm -f /tmp/templates.tpz || true

# Default entrypoint: run godot (call with args on docker run)
ENTRYPOINT ["godot"]
