extends Control
## MarriageScene.gd - 联姻界面
##
## 职责：
## 1. 选择未婚配的家族成员
## 2. 查看候选联姻对象
## 3. 检查联姻可行性
## 4. 确认联姻，生成后代
##
## 对应 PRD 屏幕 C：联姻决策

@onready var own_char_dropdown: OptionButton = $VBox/OwnCharSection/OwnCharDropdown
@onready var candidate_list: VBoxContainer = $VBox/CandidateScroll/CandidateList
@onready var detail_panel: Panel = $VBox/DetailPanel
@onready var confirm_button: Button = $VBox/ConfirmButton
@onready var back_button: Button = $VBox/BackButton

var selected_own_char_id: String = ""
var selected_candidate_id: String = ""


func _ready() -> void:
	_populate_own_characters()
	_refresh_candidate_list()

	own_char_dropdown.item_selected.connect(_on_own_char_selected)
	confirm_button.pressed.connect(_on_confirm_pressed)
	back_button.pressed.connect(_on_back_pressed)
	confirm_button.disabled = true


func _populate_own_characters() -> void:
	"""填充本家族适婚角色"""
	var chars = GameManager.get_all_living_characters()
	for char_data in chars:
		var age = char_data.get("current_age", 0)
		var spouse_id = char_data.get("spouse_id", "")
		if age >= 16 and age <= 40 and spouse_id == "":
			own_char_dropdown.add_item(
				"%s (%d岁, %s)" % [
					char_data.get("name", "?"), age, char_data.get("current_office", "无")
				]
			)
	if own_char_dropdown.item_count > 0:
		own_char_dropdown.selected = 0
		# 设置初始选中的角色
		_set_initial_own_char()


func _set_initial_own_char() -> void:
	var chars = GameManager.get_all_living_characters()
	var index = 0
	for char_data in chars:
		var age = char_data.get("current_age", 0)
		var spouse_id = char_data.get("spouse_id", "")
		if age >= 16 and age <= 40 and spouse_id == "":
			if index == 0:
				selected_own_char_id = char_data.get("id", "")
				break
			index += 1


func _refresh_candidate_list() -> void:
	"""刷新候选联姻对象列表"""
	for child in candidate_list.get_children():
		child.queue_free()

	if selected_own_char_id == "":
		var label = Label.new()
		label.text = "请选择家族适婚成员"
		candidate_list.add_child(label)
		return

	# 从所有家族中筛选候选
	var all_characters = []
	for char_id in GameManager.runtime_characters:
		var char_data = GameManager.runtime_characters[char_id]
		all_characters.append(char_data)

	for candidate in all_characters:
		if candidate.get("family_id", "") == GameManager.player_family_id:
			continue
		if not candidate.get("is_alive", false):
			continue
		if candidate.get("spouse_id", "") != "":
			continue
		var age = candidate.get("current_age", 0)
		if age < 14 or age > 45:
			continue
		if candidate.get("gender", "male") == GameManager.get_character(selected_own_char_id).get("gender", "male"):
			continue

		var can_marry = FamilyManager.can_marry(selected_own_char_id, candidate.get("id", ""))
		var row = _create_candidate_row(candidate, can_marry)
		candidate_list.add_child(row)


func _create_candidate_row(candidate: Dictionary, can_marry: Dictionary) -> Panel:
	"""创建候选对象行"""
	var panel = Panel.new()
	panel.custom_minimum_size = Vector2(0, 50)

	var btn = Button.new()
	btn.text = "%s (%d岁, %s) - %s" % [
		candidate.get("name", "?"),
		candidate.get("current_age", 0),
		candidate.get("current_office", "无"),
		candidate.get("family_id", "?")
	]
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn.disabled = not can_marry.get("can_marry", false)

	var reason_text = can_marry.get("reason", "?")
	if not can_marry.get("can_marry", false):
		btn.text += " [%s]" % reason_text

	btn.pressed.connect(_on_candidate_selected.bind(candidate.get("id", "")))
	panel.add_child(btn)
	return panel


func _on_own_char_selected(index: int) -> void:
	var chars = GameManager.get_all_living_characters()
	var valid_index = 0
	for char_data in chars:
		var age = char_data.get("current_age", 0)
		var spouse_id = char_data.get("spouse_id", "")
		if age >= 16 and age <= 40 and spouse_id == "":
			if valid_index == index:
				selected_own_char_id = char_data.get("id", "")
				break
			valid_index += 1
	_refresh_candidate_list()


func _on_candidate_selected(candidate_id: String) -> void:
	selected_candidate_id = candidate_id
	_update_detail_panel()
	confirm_button.disabled = false


func _update_detail_panel() -> void:
	"""更新详情面板"""
	for child in detail_panel.get_children():
		child.queue_free()

	var char_data = GameManager.get_character(selected_candidate_id)
	if char_data.is_empty():
		return

	var stats = char_data.get("stats", {})
	var family = GameManager.runtime_families.get(char_data.get("family_id", ""), {})

	var label = Label.new()
	label.text = """
候选对象详情：
姓名：%s (%d岁)
家族：%s (%d品)
官职：%s

属性：
  智力：%d
  武力：%d
  魅力：%d
  政才：%d
  德行：%d

联姻可行性：%s
预计后代品级：%d品
""" % [
		char_data.get("name", "?"),
		char_data.get("current_age", 0),
		GameManager.families_data.get("families", {}).get(char_data.get("family_id", ""), {}).get("name", "?"),
		family.get("rank", 5),
		char_data.get("current_office", ""),
		stats.get("intelligence", 0),
		stats.get("martial", 0),
		stats.get("charm", 0),
		stats.get("governance", 0),
		stats.get("virtue", 0),
		"✓ 可联姻",
		max(family.get("rank", 5), GameManager.get_player_family().get("rank", 5))
	]
	label.add_theme_font_size_override("font_size", 14)
	detail_panel.add_child(label)


func _on_confirm_pressed() -> void:
	"""确认联姻"""
	if selected_own_char_id == "" or selected_candidate_id == "":
		return

	# 设置婚姻关系
	RelationshipManager.set_marriage(selected_own_char_id, selected_candidate_id)
	print("[MarriageScene] 联姻成功: %s ↔ %s" % [selected_own_char_id, selected_candidate_id])

	# 联姻的政治影响
	var candidate = GameManager.get_character(selected_candidate_id)
	var candidate_family = candidate.get("family_id", "")
	if candidate_family:
		GameManager.modify_family_prestige(candidate_family, 10)
		GameManager.modify_family_prestige(GameManager.player_family_id, 10)

	# 联姻花费
	GameManager.modify_family_wealth(GameManager.player_family_id, -500)

	# 返回家族面板
	get_tree().change_scene_to_file("res://scenes/family/FamilyPanel.tscn")


func _on_back_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/family/FamilyPanel.tscn")