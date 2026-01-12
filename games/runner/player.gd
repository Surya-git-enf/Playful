extends CharacterBody2D

@export var speed := 250
@export var gravity := 1200
@export var jump_force := -450

func _physics_process(delta):
	velocity.x = speed
	velocity.y += gravity * delta

	if is_on_floor() and Input.is_action_just_pressed("ui_accept"):
		velocity.y = jump_force

	move_and_slide()

	# Restart if player goes too far
	if position.x > 800:
		get_tree().reload_current_scene()
