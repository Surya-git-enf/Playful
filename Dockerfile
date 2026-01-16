FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV GODOT_VER=4.2.1-stable

# Install required packages (including fontconfig and common X libs)
RUN apt-get update -y && \
    apt-get install -y wget unzip ca-certificates libglu1-mesa libfontconfig1 libx11-6 libxrandr2 libxcursor1 libxinerama1 libxi6 libasound2 && \
    rm -rf /var/lib/apt/lists/*

# Prepare folders
RUN mkdir -p /opt/godot /root/.local/share/godot

WORKDIR /opt/godot

# Download Godot binary (stable linux) and install as /usr/local/bin/godot
RUN wget -q "https://github.com/godotengine/godot/releases/download/${GODOT_VER}/Godot_v${GODOT_VER}_linux.x86_64.zip" -O /opt/godot/godot.zip && \
    unzip -q /opt/godot/godot.zip -d /opt/godot && \
    chmod +x /opt/godot/Godot_v${GODOT_VER}_linux.x86_64 || true && \
    mv /opt/godot/Godot_v${GODOT_VER}_linux.x86_64 /usr/local/bin/godot || true

# Download & install export templates (matching version)
RUN wget -q "https://github.com/godotengine/godot/releases/download/${GODOT_VER}/Godot_v${GODOT_VER}_export_templates.tpz" -O /tmp/templates.tpz && \
    unzip -q /tmp/templates.tpz -d /root/.local/share/godot && \
    if [ -d /root/.local/share/godot/templates ]; then mv /root/.local/share/godot/templates/* /root/.local/share/godot/ || true; fi && \
    rm -f /tmp/templates.tpz

WORKDIR /project

ENTRYPOINT ["godot"]
