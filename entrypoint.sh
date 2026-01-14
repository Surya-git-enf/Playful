#!/bin/sh
# entrypoint.sh - execute godot with provided args
# Example use (inside container):
#   godot --headless --path /project/build_work --export "Web" /project/out_builds/game1

exec godot "$@"
