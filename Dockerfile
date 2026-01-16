FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV GODOT_VER=4.2.1-stable

# Install deps
RUN apt-get update && \
    apt-get install -y wget unzip ca-certificates libglu1-mesa && \
    rm -rf /var/lib/apt/lists/*

# Install Godot headless
RUN wget https://github.com/godotengine/godot/releases/download/${GODOT_VER}/Godot_v${GODOT_VER}_linux.x86_64.zip && \
    unzip Godot_v${GODOT_VER}_linux.x86_64.zip && \
    chmod +x Godot_v${GODOT_VER}_linux.x86_64 && \
    mv Godot_v${GODOT_VER}_linux.x86_64 /usr/local/bin/godot

# Install export templates
RUN mkdir -p /root/.local/share/godot/export_templates/4.2.1.stable && \
    wget https://github.com/godotengine/godot/releases/download/${GODOT_VER}/Godot_v${GODOT_VER}_export_templates.tpz && \
    unzip Godot_v${GODOT_VER}_export_templates.tpz -d /root/.local/share/godot/export_templates/4.2.1.stable && \
    mv /root/.local/share/godot/export_templates/4.2.1.stable/templates/* \
       /root/.local/share/godot/export_templates/4.2.1.stable/

WORKDIR /project

ENTRYPOINT ["godot"]
