FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV GODOT_VER=4.2.1-stable

RUN apt-get update && apt-get install -y \
    wget unzip ca-certificates \
    libglu1-mesa libfontconfig1 \
    libx11-6 libxrandr2 libxcursor1 \
    libxinerama1 libxi6 libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Godot binary
RUN wget https://github.com/godotengine/godot/releases/download/${GODOT_VER}/Godot_v${GODOT_VER}_linux.x86_64.zip && \
    unzip Godot_v${GODOT_VER}_linux.x86_64.zip && \
    mv Godot_v${GODOT_VER}_linux.x86_64 /usr/local/bin/godot && \
    chmod +x /usr/local/bin/godot

# Export templates (CRITICAL)
RUN mkdir -p /root/.local/share/godot/export_templates/4.2.1.stable && \
    wget https://github.com/godotengine/godot/releases/download/${GODOT_VER}/Godot_v${GODOT_VER}_export_templates.tpz && \
    unzip Godot_v${GODOT_VER}_export_templates.tpz -d /root/.local/share/godot/export_templates/4.2.1.stable && \
    mv /root/.local/share/godot/export_templates/4.2.1.stable/templates/* \
       /root/.local/share/godot/export_templates/4.2.1.stable/

WORKDIR /project
ENTRYPOINT ["godot"]
