# config_loader.gd
extends Node

var cfg = {}

func _ready():
    var f = FileAccess.open("res://game_config.json", FileAccess.READ) if FileAccess.file_exists("res://game_config.json") else null
    if f:
        var txt = f.get_as_text()
        cfg = JSON.parse_string(txt).result
        print("Loaded game_config:", cfg)
        # apply simple config items (example)
        if cfg.has("player") and cfg["player"].has("speed"):
            # assume you have a global or singleton to apply
            if Engine.has_singleton("GameSettings"):
                Engine.get_singleton("GameSettings").player_speed = cfg["player"]["speed"]
