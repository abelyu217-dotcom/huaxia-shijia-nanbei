extends Control
## CultivationScene.gd - 养成界面
##
## 职责：
## 1. 选择培养对象（族人）
## 2. 选择培养方向（名臣/统帅/艺术家/名士/隐逸）
## 3. 选择师傅
## 4. 选择季度培养计划
##
## 对应 PRD 屏幕 3：养成界面

@onready var character_dropdown: OptionButton = $VBox/CharacterSection/CharacterDropdown
@onready var path_dropdown: OptionButton = $VBox/PathSection/PathDropdown
@onready var duration_slider: HSlider = $VBox/DurationSection/DurationSlider
@onready var duration_label: Label = $VBox/DurationSection/DurationLabel
@onready var preview_label: Label = $VBox/PreviewLabel
@onready var confirm_button: Button = $VBox/ConfirmButton
@onready var back_button: Button = $VBox/BackButton

var selected_character_id: String = ""
var selected_path: int = CharacterManager.CultivationPath.OFFICIAL

# 5个培养方向
var cultivation_paths = [
	{"id": CharacterManager.CultivationPath.OFFICIAL, "name": "名臣", "desc": "治理国家、出仕为官"},
	{"id": CharacterManager.CultivationPath.GENERAL, "name": "统帅", "desc": "领兵打仗、镇守一方"},
	{"id": CharacterManager.CultivationPath.ARTIST, "name": "艺术家", "desc": "书法、绘画、音乐"},
	{"id": CharacterManager.CultivationPath.SCHOLAR, "name": "名士", "desc": "清谈、玄学、文学"},
	{"id": CharacterManager.CultivationPath.HERMIT, "name": "隐逸", "desc": "远离世俗、修身养性"}
]


func _ready() -> void:
	_populate_character_dropdown()
	_populate_path_dropdown()
	duration_slider.value = 3
	_on_duration_changed(3)
	_update_preview()

	character_dropdown.item_selected.connect(_on_character_selected)
	path_dropdown.item_selected.connect(_on_path_selected)
	duration_slider.value_changed.connect(_on_duration_changed)
	confirm_button.pressed.connect(_on_confirm_pressed)
	back_button.pressed.connect(_on_back_pressed)


func _populate_character_dropdown() -> void:
	"""填充角色下拉框"""
	var chars = GameManager.get_all_living_characters()
	for char_data in chars:
		character_dropdown.add_item(
			"%s (%d岁)" % [char_data.get("name", "?"), char_data.get("current_age", 0)]
		)
	if chars.size() > 0:
		selected_character_id = chars[0].get("id", "")
		character_dropdown.selected = 0


func _populate_path_dropdown() -> void:
	"""填充培养方向下拉框"""
	for path in cultivation_paths:
		path_dropdown.add_item("%s - %s" % [path["name"], path["desc"]])
	path_dropdown.selected = 0


func _on_character_selected(index: int) -> void:
	var chars = GameManager.get_all_living_characters()
	if index < chars.size():
		selected_character_id = chars[index].get("id", "")
		_update_preview()


func _on_path_selected(index: int) -> void:
	if index < cultivation_paths.size():
		selected_path = cultivation_paths[index]["id"]
		_update_preview()


func _on_duration_changed(value: float) -> void:
	duration_label.text = "培养时长: %d 个月" % int(value)
	_update_preview()


func _update_preview() -> void:
	"""更新预览"""
	var char_data = GameManager.get_character(selected_character_id)
	if char_data.is_empty():
		preview_label.text = "请选择角色"
		return

	var path_name = "?"
	for p in cultivation_paths:
		if p["id"] == selected_path:
			path_name = p["name"]
			break

	var preview = """
角色: %s (%d岁)
当前属性: 智%d 武%d 魅%d 政%d 德%d

培养方向: %s
培养时长: %d 个月

预计提升:
"""
	preview = preview % [
		char_data.get("name", "?"),
		char_data.get("current_age", 0),
		char_data.get("stats", {}).get("intelligence", 0),
		char_data.get("stats", {}).get("martial", 0),
		char_data.get("stats", {}).get("charm", 0),
		char_data.get("stats", {}).get("governance", 0),
		char_data.get("stats", {}).get("virtue", 0),
		path_name,
		int(duration_slider.value)
	]

	# 列出可能提升的属性
	var weights = CharacterManager.PATH_STAT_WEIGHTS.get(selected_path, {})
	for stat in weights:
		var base_gain = weights[stat] * duration_slider.value
		preview += "  %s: +%.1f\n" % [stat, base_gain]

	preview_label.text = preview


func _on_confirm_pressed() -> void:
	"""确认培养"""
	if selected_character_id == "":
		return

	var stat_gains = CharacterManager.cultivate_character(selected_character_id, selected_path, int(duration_slider.value))
	# 推进时间
	TimeManager.advance_one_season()
	_update_preview()
	print("[CultivationScene] 培养完成，属性提升: %s" % stat_gains)


func _on_back_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/family/FamilyPanel.tscn")